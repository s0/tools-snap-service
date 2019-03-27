/**
 * print-api
 * node.js web service for puppeteer/chrome for generating PDFs or PNGs from HTML.
 *
 * Accepts POST requests to /snap with either a HTTP file upload sent with
 * the name "html" or body form data with HTML content in a field named "html".
 *
 * Alternatively, we accept a `url` parameter which will render an arbitrary
 * web page on the internet.
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
const { query, body, validationResult } = require('express-validator/check');
const { sanitize } = require('express-validator/filter');
const url = require('url');

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

// PDF margin units
const allowedPdfMarginUnits = ['px', 'mm', 'cm', 'in'];

// Helper function.
function ated(request) {
  return request.headers['x-forwarded-for'] ||
         request.connection.remoteAddress ||
         request.socket.remoteAddress ||
         (request.connection.socket ? request.connection.socket.remoteAddress : null);
}

// Launch Puppeteer.
//
// Using the launch() command multiple times results in multiple Chromium procs
// but (just like a normal web browser) we only want one. We'll open a new "tab"
// each time our `/snap` route is invoked by reusing the established connection.
let browserWSEndpoint = '';

async function connectPuppeteer() {
  let browser;

  if (browserWSEndpoint) {
    browser = await puppeteer.connect({browserWSEndpoint});
  }
  else {
    // Initialize Puppeteer
    browser = await puppeteer.launch({
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

    browserWSEndpoint = browser.wsEndpoint();
  }

  return browser;
}

// Set up the Express app
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
  body('html', '').optional(),
  query('url', 'Must be a valid, fully-qualified URL').optional().isURL({ require_protocol: true, disallow_auth: true }),
  query('width', 'Must be an integer with no units').optional().isInt(),
  query('height', 'Must be an integer with no units').optional().isInt(),
  query('scale', 'Must be an integer in the range: 1-3').optional().isInt({ min: 1, max: 3 }),
  query('media', 'Must be one of the following: print, screen').optional().isIn([ 'print', 'screen' ]),
  query('output', 'Must be one of the following: png, pdf').optional().isIn([ 'png', 'pdf' ]),
  query('selector', `Must be a CSS selector made of the following characters: ${allowedSelectorChars}`).optional().isWhitelisted(allowedSelectorChars),
  query('pdfFormat', `Must be one of the following values: ${allowedFormats.join(', ')}`).optional().isIn(allowedFormats),
  query('pdfLandscape', 'Must be one of the following: true, false').optional().isBoolean(),
  query('pdfBackground', 'Must be one of the following: true, false').optional().isBoolean(),
  query('pdfMarginTop', 'Must be a decimal with no units. Use pdfMarginUnit to set units.').optional().isNumeric(),
  query('pdfMarginRight', 'Must be a decimal with no units. Use pdfMarginUnit to set units.').optional().isNumeric(),
  query('pdfMarginBottom', 'Must be a decimal with no units. Use pdfMarginUnit to set units.').optional().isNumeric(),
  query('pdfMarginLeft', 'Must be a decimal with no units. Use pdfMarginUnit to set units.').optional().isNumeric(),
  query('pdfMarginUnit', `Must be one of the following values: ${allowedPdfMarginUnits.join(', ')}`).optional().isIn(allowedPdfMarginUnits),
  query('user', 'Must be an alphanumeric string').optional().isAlphanumeric(),
  query('pass', 'Must be an alphanumeric string').optional().isAlphanumeric(),
  query('logo', `Must be one of the following values: ${Object.keys(logos).join(', ')}. If you would like to use your site's logo with Snap Service, please read how to add it at https://github.com/UN-OCHA/tools-snap-service#custom-logos`).optional().isIn(Object.keys(logos)),
  query('service', 'Must be an alphanumeric string identifier for the requesting service.').optional().isAlphanumeric(),
  query('ua', '').optional(),
], (req, res) => {
  // debug
  log.debug({ 'query': url.parse(req.url).query }, 'Request received');

  // If neither `url` and `html` are present, return 400 requiring valid input.
  if (!req.query.url && !req.body.html) {
    return res.status(400).json({ errors: [
      {
        'location': 'query',
        'param': 'url',
        'value': undefined,
        'msg': 'You must supply either `url` as a querystring parameter, or `html` as a URL-encoded form field.',
      },
      {
        'location': 'body',
        'param': 'html',
        'value': undefined,
        'msg': 'You must supply either `url` as a querystring parameter, or `html` as a URL-encoded form field.',
      },
    ]});
  }

  // If both `url` and `html` are present, return 400 requiring valid input.
  if (req.query.url && req.body.html) {
    return res.status(400).json({ errors: [
      {
        'location': 'query',
        'param': 'url',
        'value': req.query.url,
        'msg': 'You must supply either `url` as a querystring parameter, OR `html` as a URL-encoded form field, but not both.',
      },
      {
        'location': 'body',
        'param': 'html',
        'value': req.body.html,
        'msg': 'You must supply either `url` as a querystring parameter, OR `html` as a URL-encoded form field, but not both.',
      },
    ]});
  }

  // Validate input errors, return 422 for any problems.
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
  const fnHtml = req.body.html || '';
  const fnWidth = Number(req.query.width) || 800;
  const fnHeight = Number(req.query.height) || 600;
  const fnScale = Number(req.query.scale) || 2;
  const fnMedia = req.query.media || 'screen';
  const fnOutput = req.query.output || 'pdf';
  const fnPdfFormat = req.query.pdfFormat || 'A4';
  const fnPdfLandscape = Boolean(req.query.pdfLandscape === 'true') || false;
  const fnPdfBackground = Boolean(req.query.pdfBackground === 'true') || false;
  const fnPdfMarginTop = req.query.pdfMarginTop || '0';
  const fnPdfMarginRight = req.query.pdfMarginRight || '0';
  const fnPdfMarginBottom = req.query.pdfMarginBottom || '64';
  const fnPdfMarginLeft = req.query.pdfMarginLeft || '0';
  const fnPdfMarginUnit = req.query.pdfMarginUnit || 'px';
  const fnPdfHeader = req.query.pdfHeader || '';
  const fnPdfFooter = req.query.pdfFooter || '';
  const fnAuthUser = req.query.user || '';
  const fnAuthPass = req.query.pass || '';
  const fnCookies = req.query.cookies || '';
  const fnSelector = req.query.selector || '';
  const fnFullPage = (fnSelector) ? false : true;
  const fnLogo = req.query.logo || false;
  const fnService = req.query.service || '';
  const fnUserAgent = req.query.ua || '';

  // Declare options objects here so that multiple scopes have access to them.
  let pngOptions = {};
  let pdfOptions = {};

  // Make a nice blob for the logs. ELK will sort this out.
  // Blame Emma.
  const ip = ated(req);
  let lgParams = {
    'url': fnUrl,
    'html': fnHtml,
    'width': fnWidth,
    'height': fnHeight,
    'scale': fnScale,
    'media': fnMedia,
    'output': fnOutput,
    'format': fnPdfFormat,
    'pdfLandscape': fnPdfLandscape,
    'pdfBackground': fnPdfBackground,
    'pdfMarginTop': fnPdfMarginTop,
    'pdfMarginRight': fnPdfMarginRight,
    'pdfMarginBottom': fnPdfMarginBottom,
    'pdfMarginLeft': fnPdfMarginLeft,
    'pdfMarginUnit': fnPdfMarginUnit,
    'pdfHeader': fnPdfHeader,
    'pdfFooter': fnPdfFooter,
    'authuser': fnAuthUser,
    'authpass': (fnAuthPass ? '*****' : ''),
    'cookies': fnCookies,
    'selector': fnSelector,
    'fullpage': fnFullPage,
    'logo': fnLogo,
    'service': fnService,
    'ua': fnUserAgent,
    'ip': ip,
  };

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

          lgParams.size = sizeHtml;
          lgParams.tmpfile = tmpPath;
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

          lgParams.size = sizeHtml;
          lgParams.tmpfile = tmpPath;
        });
      }
      else if (req.query.url) {
        const digest = crypto.createHash('md5').update(fnUrl).digest('hex');
        tmpPath = `/tmp/snap-${Date.now()}-${digest}.${fnOutput}`;
        lgParams.tmpfile = tmpPath;
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
          let hasLogo = false;

          pngOptions = {
            path: tmpPath,
            fullPage: fnFullPage,
          };

          pdfOptions = {
            path: tmpPath,
            format: fnPdfFormat,
            landscape: fnPdfLandscape,
            printBackground: fnPdfBackground,
            displayHeaderFooter: !!fnPdfHeader || !!fnPdfFooter,
            headerTemplate: fnPdfHeader,
            footerTemplate: fnPdfFooter,
            margin: {
              top: fnPdfMarginTop + fnPdfMarginUnit,
              right: fnPdfMarginRight + fnPdfMarginUnit,
              bottom: fnPdfMarginBottom + fnPdfMarginUnit,
              left: fnPdfMarginLeft + fnPdfMarginUnit,
            },
          };

          // Do string substitution on the fnPdfHeader is the logo was specified.
          if (logos.hasOwnProperty(fnLogo)) {
            hasLogo = true;
            const pdfLogoFile = __dirname + '/logos/' + logos[fnLogo].filename;
            const pdfLogoData = new Buffer(fs.readFileSync(pdfLogoFile, 'binary'));
            const pdfLogo = {
              src: `data:${mime.lookup(pdfLogoFile)};base64,${pdfLogoData.toString('base64')}`,
              width: imgSize(pdfLogoFile).width * .75,
              height: imgSize(pdfLogoFile).height * .75,
            };

            // TODO: margin-top calculation is DSR-specific logic that should be
            //       amended using the new pdfMargin params once they're shipped
            pdfOptions.margin.top = imgSize(pdfLogoFile).height + 84 + 'px';
            pdfOptions.headerTemplate = fnPdfHeader
              .replace('__LOGO_SRC__', pdfLogo.src)
              .replace('__LOGO_WIDTH__', pdfLogo.width)
              .replace('__LOGO_HEIGHT__', pdfLogo.height);
          }

        } catch (err) {
          log.error('createSnap', err);
          return cb(err);
        }

        try {
          // Access the Chromium instance by either launching or connecting to
          // Puppeteer.
          const browser = await connectPuppeteer();

          // New Puppeteer Incognito context and create a new page within.
          const context = await browser.createIncognitoBrowserContext();
          const page = await context.newPage();

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

          // Compile cookies if present. We have to manually specify some extra
          // info such as host/path in order to create a valid cookie.
          let cookies = [];
          if (!!fnCookies) {
            fnCookies.split('; ').map((cookie) => {
              let thisCookie = {};
              const [name, value] = cookie.split('=');

              thisCookie.url = fnUrl;
              thisCookie.name = name;
              thisCookie.value = value;

              cookies.push(thisCookie);
            });
          }

          // Set cookies.
          cookies.forEach(async function(cookie) {
            await page.setCookie(cookie).catch((err) => {
              log.error(err);
            });
          })

          // We need to load the HTML differently depending on whether it's HTML
          // in the POST or a URL in the querystring.
          if (fnUrl) {
            await page.goto(fnUrl, {
              'waitUntil': 'load',
            });
          } else {
            await page.setContent(fnHtml);
          }

          // Add a conditional class indicating what type of Snap is happening.
          // Websites can use this class to apply customizations before the final
          // asset (PNG/PDF) is generated.
          //
          // Note: page.evaluate() is a stringified injection into the runtime.
          //       any arguments you need inside this function block have to be
          //       explicitly passed instead of relying on closure.
          await page.evaluate((snapOutput) => {
            document.documentElement.classList.add(`snap--${snapOutput}`);
          }, fnOutput);

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

          // Disconnect from Puppeteer process
          await context.close();
          await browser.disconnect();
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
            lgParams.duration = duration
            log.info(lgParams, `PNG ${tmpPath} successfully generated for ${fnUrl}${fnHtml} in ${duration} seconds.`);
            return fs.unlink(tmpPath, cb);
          });
        } else {
          res.contentType('application/pdf');
          res.sendFile(tmpPath, () => {
            const duration = ((Date.now() - startTime) / 1000);
            res.end();
            lgParams.duration = duration
            log.info(lgParams, `PDF ${tmpPath} successfully generated for ${fnUrl}${fnHtml} in ${duration} seconds.`);
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
      lgParams.duration = duration
      log.warn(lgParams, `Hardcopy generation failed for HTML ${fnUrl}${fnHtml} in ${duration} seconds. ${err}`);
      res.status(500).send('' + err);
    }
  });
});

http.createServer(app).listen(app.get('port'), () => {
  log.info('⚡️ Express server listening on port:', app.get('port'));
});
