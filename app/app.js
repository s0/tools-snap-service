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
const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const { query, validationResult } = require('express-validator/check');

const puppeteer = require('puppeteer');
const moment = require('moment');
const mime = require('mime-types');
const imgSize = require('image-size');
const he = require('he');
const log = require('./log');

// We don't set this as a variable because it defines its own vars inside
require('./config');

// Load our list of custom logos. We do it early on in order to validate against
// the possible values and give a more informative validation error.
const logos = require('./logos/_list.json');

// It's impossible to regex a CSS selector so we'll assemble a list of the most
// common characters. Feel free to add to this list if it's preventing a legitimate
// selector from being used. The space at the beginning of this string is intentional.
const allowedSelectorChars = ' #.[]()-_=+:~^*abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// PDF paper sizes
const allowedFormats = ['Letter', 'Legal', 'Tabloid', 'Ledger', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

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

app.post('/snap', [
  query('url', 'Must be a valid, fully-qualified URL').isURL({ require_protocol: true, disallow_auth: true }),
  query('width', 'Must be an integer with no units').optional().isInt(),
  query('height', 'Must be an integer with no units').optional().isInt(),
  query('scale', 'Must be an integer in the range: 1-3').optional().isInt({ min: 1, max: 3 }),
  query('media', 'Must be one of the following: print, screen').optional().isIn([ 'print', 'screen' ]),
  query('output', 'Must be one of the following: png, pdf').optional().isIn([ 'png', 'pdf' ]),
  query('selector', `Must be a CSS selector made of the following characters: ${allowedSelectorChars}`).optional().isWhitelisted(allowedSelectorChars),
  query('format', `Must be one of the following values: ${allowedFormats.join(', ')}`).optional().isIn(allowedFormats),
  query('user', 'Must be an alphanumeric string').optional().isAlphanumeric(),
  query('pass', 'Must be an alphanumeric string').optional().isAlphanumeric(),
  query('logo', `Must be one of the following values: ${Object.keys(logos).join(', ')}. If you would like to use your site's logo with Snap Service, please read how to add it at https://github.com/UN-OCHA/tools-snap-service#custom-logos`).optional().isIn(Object.keys(logos)),
  query('headerTitle', 'Must be an alphanumeric string').optional().isAscii(),
  query('headerSubtitle', 'Must be an alphanumeric string').optional().isAscii(),
  query('headerDescription', 'Must be an alphanumeric string').optional().isAscii(),
], (req, res) => {
  // debug
  console.log('🔗', require('url').parse(req.url).query);

  // Check for validation errors and return immediately if request was invalid.
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  // Housekeeping
  const startTime = Date.now();
  let tmpPath = '';
  let sizeHtml = 0;

  // Assign validated querystring params to variables and set defaults.
  const fnUrl = req.query.url || false;
  const fnWidth = Number(req.query.width) || 800;
  const fnHeight = Number(req.query.height) || 600;
  const fnScale = Number(req.query.scale) || 2;
  const fnMedia = req.query.media || 'screen';
  const fnOutput = req.query.output || 'pdf';
  const fnFormat = req.query.format || 'A4';
  const fnAuthUser = req.query.user || '';
  const fnAuthPass = req.query.pass || '';
  const fnSelector = req.query.selector || '';
  const fnFullPage = (fnSelector) ? false : true;
  const fnLogo = req.query.logo || false;
  const fnHeaderTitle = req.query.headerTitle || '';
  const fnHeaderSubtitle = req.query.headerSubtitle || '';
  const fnHeaderDescription = req.query.headerDescription || '';

  let fnHtml = '';
  let pngOptions = {};
  let pdfOptions = {};

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
      else if (req.query.url) {
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
        try {
          pngOptions = {
            path: tmpPath,
            fullPage: fnFullPage,
          };

          pdfOptions = {
            path: tmpPath,
            format: fnFormat,
            displayHeaderFooter: true,
            headerTemplate: ``, // default template is used if we don't provide empty string
            footerTemplate: `
              <footer class="pdf-footer">
                <div class="pdf-footer__left">
                  Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
                <div class="pdf-footer__right">
                  Date of Creation: <span>${moment().format('D MMM YYYY')}</span><br>
                  <span class="url"></span><br>
                </div>
              </footer>
              <style type="text/css">
                *,
                *:before,
                *:after {
                  box-sizing: border-box;
                }

                .pdf-footer {
                  width: 100%;
                  font-size: 12px;
                  margin: 0 7.5mm;
                  white-space: nowrap;

                  font-family: "Roboto Condensed", Roboto, serif;
                  font-weight: 400;
                  font-size: 12px;
                }
                .pdf-footer__left {
                  position: relative;
                  top: 28px;
                }
                .pdf-footer__right {
                  text-align: right;
                }
              </style>`,
            margin: { top: 0, bottom: '64px', left: 0, right: 0 },
          };

          if (logos.hasOwnProperty(fnLogo)) {
            const pdfLogoFile = __dirname + '/logos/' + logos[fnLogo].filename;
            const pdfLogoData = new Buffer(fs.readFileSync(pdfLogoFile, 'binary'));
            const pdfLogoEncoded = `data:${mime.lookup(pdfLogoFile)};base64,${pdfLogoData.toString('base64')}`;

            pdfOptions.margin.top = imgSize(pdfLogoFile).height + 84;
            pdfOptions.headerTemplate = `
              <header class="pdf-header">
                <div class="pdf-header__meta">
                  <div class="pdf-header__title">${he.encode(fnHeaderTitle)}</div>
                  <div class="pdf-header__subtitle">${he.encode(fnHeaderSubtitle)}</div>
                  <div class="pdf-header__description">${he.encode(fnHeaderDescription)}</div>
                </div>
                <div class="pdf-header__logo-wrapper">
                  <img src="${pdfLogoEncoded}" alt="logo" class="pdf-header__logo">
                </div>
              </header>
              <style type="text/css">
                *,
                *:before,
                *:after {
                  box-sizing: border-box;
                }

                .pdf-header {
                  width: 100%;
                  margin: 0 7.5mm 7.5mm;
                  padding-bottom: 10px;
                  border-bottom: 2px solid #4c8cca;

                  font-family: "Roboto Condensed", Roboto, serif;
                  font-weight: 400;
                  font-size: 12px;
                  white-space: nowrap;

                  display: grid;
                  grid-template-areas: "logo meta";
                  grid-template-columns: ${imgSize(pdfLogoFile).width}px 2fr;
                }

                .pdf-header__meta {
                  grid-area: meta;
                  font-size: inherit;
                  padding-left: 10px;
                  margin-left: 10px;
                  border-left: 2px solid #4c8cca;
                }
                .pdf-header__title {
                  font-size: 1.5em;
                  font-weight: 700;
                }
                .pdf-header__subtitle {
                }
                .pdf-header__description {
                }

                .pdf-header__logo-wrapper {
                  grid-area: logo;
                }
                .pdf-header__logo {
                  width: ${imgSize(pdfLogoFile).width}px;
                  height: ${imgSize(pdfLogoFile).height}px;
                }
              </style>`;
          }
        } catch (err) {
          log.error('createSnap', err);
          return cb(err);
        }

        try {
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
            dumpio: false, // set to `true` for debugging
          });

          // New Puppeteer tab
          const page = await browser.newPage();

          // Set duration until Timeout
          await page.setDefaultNavigationTimeout(60 * 1000);

          // Use HTTP auth if needed (for testing staging envs)
          if (fnAuthUser && fnAuthPass) {
            await page.authenticate({ username: fnAuthUser, password: fnAuthPass });
          }

          // Set viewport dimensions
          await page.setViewport({ width: fnWidth, height: fnHeight, deviceScaleFactor: fnScale });

          // Set CSS Media
          await page.emulateMedia(fnMedia);

          // We need to load the HTML differently depending on whether it's HTML
          // in the POST or a URL in the querystring.
          if (fnUrl) {
            await page.goto(fnUrl, {
              'waitUntil': 'load',
            });
          } else {
            await page.setContent(fnHtml);
          }

          // Output PNG or PDF?
          if (fnOutput === 'png') {
            // Output whole document or DOM fragment?
            if (fnSelector) {
              pngOptions.omitBackground = true;
              const fragment = await page.$(fnSelector);
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
        catch (err) {
          throw new Error('🔥 ' + err);
        }
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
      log.warn({ duration, inputSize: sizeHtml }, `Hardcopy generation failed for HTML ${fnHtml} in ${duration} seconds. ${err}`);
      res.status(500).send('' + err);
    }
  });
});

http.createServer(app).listen(app.get('port'), () => {
  console.info('⚡️ Express server listening on port:', app.get('port'));
});
