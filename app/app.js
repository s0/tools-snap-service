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
const https = require('https');
const puppeteer = require('puppeteer');
const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
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
  let sizeHtml = 0;
  let fnMedia = 'screen'; // assume ppl want WYSIWYG screenshots, not print CSS
  let fnHtml = '';
  let fnOutput = 'pdf';
  let fnFormat = 'A4';
  let fnPath = '';
  let fnUrl = false;
  let fnAuthUser = '';
  let fnAuthPass = '';
  let fnFragment = '';
  let fnBackground = false;
  const startTime = Date.now();

  async.series([
    function validateRequest(cb) {
      // What output?
      if (req.query && req.query.format && req.query.format === 'png') {
        fnOutput = 'png';
      }

      // Validate uploaded HTML file
      if (req.files && req.files.html && req.files.html.path) {
        fs.stat(req.files.html.path, (err, stats) => {
          if (err || !stats || !stats.isFile()) {
            log.error({ files: req.files, stats }, 'An error occurred while trying to validate the HTML upload.');
            return cb(new Error('An error occurred while trying to validate the HTML upload.'));
          }

          sizeHtml = stats.size || 0;
          fnHtml = req.files.html.path;
          fnPath = `${fnHtml}.${fnOutput}`;
        });
      }
      else if (req.body && req.body.html && req.body.html.length) {
        const tmpPath = `/tmp/snap-${Date.now()}.html`;
        sizeHtml = req.body.html.length;

        fs.writeFile(tmpPath, req.body.html, (err) => {
          if (err) {
            log.error({ body: req.body }, 'An error occurred while trying to validate the HTML post data.');
            return cb(new Error('An error occurred while trying to validate the HTML post data.'));
          }

          fnPath = `${tmpPath}.${fnOutput}`;
        });
      }
      else if (req.query && req.query.url && req.query.url.length && (req.query.url.substr(0, 7) === 'http://' || req.query.url.substr(0, 8) === 'https://')) {
        fnUrl = true;
        fnHtml = req.query.url;
        fnAuthUser = (req.query.user) ? req.query.user : '';
        fnAuthPass = (req.query.pass) ? req.query.pass : '';
        fnFragment = (req.query.frag) ? req.query.frag : '';

        const digest = crypto.createHash('md5').update(fnHtml).digest('hex');

        fnPath = `/tmp/snap-${Date.now()}-${digest}.${fnOutput}`;
      }
      else {
        const noCaseErrMsg = 'An HTML file was not uploaded or could not be accessed.';
        log.error(noCaseErrMsg);
        return cb(new Error(noCaseErrMsg));
      }

      return cb(null, 'everything is fine');
    },
    function generateResponse(cb) {
      async function createSnap() {
        let pngOptions = {};
        let pdfOptions = {};

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

        // We need to load the HTML differently depending on whether it's local
        // text in the POST or a URL in the querystring.
        if (fnUrl === true) {
          await page.goto(fnHtml);
        }
        else {
          await page.setContent(fnHtml);
        }

        // PNG or PDF?
        if (fnOutput === 'png') {
          pngOptions.path = fnPath;
          pngOptions.omitBackground = true;

          // Whole document or fragment?
          if (fnFragment) {
            pngOptions.omitBackground = true;
            let fragment = await page.$(fnFragment);
            await fragment.screenshot(pngOptions);
          }
          else {
            await page.screenshot(pngOptions);
          }
        } else {
          // @media(print) is default for Puppeteer PDF generation
          if (fnMedia === 'screen') {
            await page.emulateMedia('screen');
          }

          await page.pdf({ path: fnPath, format: fnFormat });
        }

        // Close tab
        await browser.close();
      }

      createSnap().then(() => {
        res.charset = 'utf-8';

        if (fnOutput === 'png') {
          res.contentType('image/png');
          res.sendFile(fnPath, () => {
            const duration = ((Date.now() - startTime) / 1000);
            res.end();
            log.info({ duration, inputSize: sizeHtml }, `PNG ${fnPath} successfully generated for ${fnHtml} in ${duration} seconds.`);
            return fs.unlink(fnPath, cb);
          });
        }
        else {
          res.contentType('application/pdf');
          res.sendFile(fnPath, () => {
            const duration = ((Date.now() - startTime) / 1000);
            res.end();
            log.info({ duration, inputSize: sizeHtml }, `PDF ${fnPath} successfully generated for ${fnHtml} in ${duration} seconds.`);
            return fs.unlink(fnPath, cb);
          });
        }

        // if (fnHtml.length && fnUrl === false) {
        //   return fs.unlink(fnHtml, cb);
        // }
        // log.info(`Successfully removed input (${fnHtml}) and output (${fnPath}) files.`);

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
      res.send(500, 'Error');
    }
  });
});

http.createServer(app).listen(app.get('port'), () => {
  console.info('⚡️ Express server listening on port:', app.get('port'));
});
