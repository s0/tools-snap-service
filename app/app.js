/**
 * print-api
 * node.js web service for puppeteer/chrome for generating PDFs or PNGs from HTML.
 *
 * Accepts POST requests to /snap with either a HTTP file upload sent with
 * the name "html" or body form data with HTML content in a field named "html".
 *
 * The service will run hrome and return the generated PDF or PNG data.
 *
 * This service is not meant to be exposed to the public, and use of this
 * service should be mediated by another application with access controls.
 */
const fs = require('fs');
const crypto = require('crypto');
const async = require('async');
const http = require('http');
// const https = require('https');
const puppeteer = require('puppeteer');
const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const moment = require('moment');
const log = require('./log');

// We don't set this as a variable because it defines its own vars inside
require('./config');

// Set up the application
const app = express();

app.set('env', process.env.NODE_ENV || 'dockerdev');
app.set('port', process.env.PORT || 80);

app.use(bodyParser.urlencoded({
  extended: true,
  limit: '10mb',
  uploadDir: '/tmp',
}));

app.use(methodOverride());

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (process.env.NODE_ENV !== 'test') {
    log.error(`Error: ${JSON.stringify(err)}`);
  }

  res.status(err.code || 500);
  res.send('Error');
});

app.post('/snap', (req, res) => {
  const startTime = Date.now();
  let tmpPath = '';
  let sizeHtml = 0;

  const fnWidth = (req.query.width) ? Number(req.query.width) : 800;
  const fnHeight = (req.query.height) ? Number(req.query.height) : 600;
  const fnMedia = (req.query.media === 'print') ? 'print' : 'screen';
  const fnOutput = (req.query.output === 'png') ? 'png' : 'pdf';
  const fnFormat = 'A4';
  const fnAuthUser = req.query.user || '';
  const fnAuthPass = req.query.pass || '';
  const fnFragment = req.query.frag || '';
  const fnFullPage = (fnFragment) ? false : true;
  const fnScale = Number(req.query.scale) || 2;
  const fnUrl = req.query.url || false;

  let fnHtml = '';

  async.series([
    function validateRequest(cb) {
      // Validate uploaded HTML file
      if (req.files && req.files.html && req.files.html.path) {
        fs.stat(req.files.html.path, (err, stats) => {
          if (err || !stats || !stats.isFile()) {
            log.error({ files: req.files, stats }, 'An error occurred while trying to validate the HTML upload.');
            return cb(new Error('An error occurred while trying to validate the HTML upload.'));
          }

          sizeHtml = stats.size || 0;
          fnHtml = req.files.html.path;
          tmpPath = `${fnHtml}.${fnOutput}`;
        });
      }
      else if (req.body && req.body.html && req.body.html.length) {
        tmpPath = `/tmp/snap-${Date.now()}.html`;
        sizeHtml = req.body.html.length;

        fs.writeFile(tmpPath, req.body.html, (err) => {
          if (err) {
            log.error({ body: req.body }, 'An error occurred while trying to validate the HTML post data.');
            return cb(new Error('An error occurred while trying to validate the HTML post data.'));
          }

          tmpPath = `${tmpPath}.${fnOutput}`;
        });
      }
      else if (req.query && req.query.url && req.query.url.length && (req.query.url.substr(0, 7) === 'http://' || req.query.url.substr(0, 8) === 'https://')) {
        const digest = crypto.createHash('md5').update(fnUrl).digest('hex');
        tmpPath = `/tmp/snap-${Date.now()}-${digest}.${fnOutput}`;
      }
      else {
        const noCaseErrMsg = 'An HTML file was not uploaded or could not be accessed.';
        log.error(noCaseErrMsg);
        return cb(new Error(noCaseErrMsg));
      }

      return cb(null, 'everything is fine');
    },
    function generateResponse(cb) {
      /**
       * Puppeteer code to generate PNG/PDF Snap.
       */
      async function createSnap() {
        const pngOptions = {
          path: tmpPath,
          fullPage: fnFullPage,
        };

        const pdfOptions = {
          path: tmpPath,
          format: fnFormat,
          displayHeaderFooter: true,
          headerTemplate: ``, // default template is used if we don't provide empty string
          footerTemplate: `
            <footer style="width: 100%; font-size: 12px; margin: 0 16px; white-space: nowrap;">
              <div style="position: relative; top: 14px;">
                Page <span class="pageNumber"></span> of <span class="totalPages"></span>
              </div>
              <div style="text-align: right;">
                Date of Creation: <span>${moment().format('D MMM YYYY')}</span><br>
              </div>
            </footer>`,
          margin: { top: 0, bottom: '100px', left: 0, right: 0 },
        };

        // Process HTML file with puppeteer
        const browser = await puppeteer.launch({
          executablePath: '/usr/bin/google-chrome',
          args: [
            '--headless',
            '--disable-gpu',
            '--remote-debugging-port=9222',
            '--remote-debugging-address=0.0.0.0',
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
        });

        // New Puppeteer tab
        const page = await browser.newPage();

        // Use HTTP auth if needed (for testing staging envs)
        if (fnAuthUser && fnAuthPass) {
          await page.authenticate({ username: fnAuthUser, password: fnAuthPass });
        }

        // We need to load the HTML differently depending on whether it's HTML
        // in the POST or a URL in the querystring.
        if (fnUrl) {
          await page.goto(fnUrl);
        } else {
          await page.setContent(fnHtml);
        }

        // Set viewport dimensions
        await page.setViewport({ width: fnWidth, height: fnHeight, deviceScaleFactor: fnScale });

        // Set CSS Media
        await page.emulateMedia(fnMedia);

        // Output PNG or PDF?
        if (fnOutput === 'png') {
          // Output whole document or DOM fragment?
          if (fnFragment) {
            pngOptions.omitBackground = true;
            const fragment = await page.$(fnFragment);
            await fragment.screenshot(pngOptions);
          } else {
            await page.screenshot(pngOptions);
          }
        } else {
          await page.pdf(pdfOptions);
        }

        // Close tab
        await browser.close();
      }

      /**
       * Express response and tmp file cleanup.
       */
      createSnap().then(() => {
        res.charset = 'utf-8';

        if (fnOutput === 'png') {
          res.contentType('image/png');
          res.sendFile(tmpPath, () => {
            const duration = ((Date.now() - startTime) / 1000);
            res.end();
            log.info({ duration, inputSize: sizeHtml }, `PNG ${tmpPath} successfully generated for ${fnHtml} in ${duration} seconds.`);
            return fs.unlink(tmpPath, cb);
          });
        } else {
          res.contentType('application/pdf');
          res.sendFile(tmpPath, () => {
            const duration = ((Date.now() - startTime) / 1000);
            res.end();
            log.info({ duration, inputSize: sizeHtml }, `PDF ${tmpPath} successfully generated for ${fnHtml} in ${duration} seconds.`);
            return fs.unlink(tmpPath, cb);
          });
        }

        // if (fnHtml.length && fnUrl === false) {
        //   return fs.unlink(fnHtml, cb);
        // }
        // log.info(`Successfully removed input (${fnHtml}) and output (${tmpPath}) files.`);

        // return cb(null, 'everything is fine');
      }).catch((err) => {
        log.error('createSnap', err);
        return cb(err);
      });
    },
  ],
  (err) => {
    const duration = ((Date.now() - startTime) / 1000);

    if (err) {
      log.warn({ duration, inputSize: sizeHtml }, `Hardcopy generation failed for HTML ${fnHtml} in ${duration} seconds.`);
      res.status(500).send(err);
    }
  });
});

http.createServer(app).listen(app.get('port'), () => {
  console.info('⚡️ Express server listening on port:', app.get('port'));
});
