# Snap Service

> 🤔 How does a computer get drunk?
>
> 🤣 It takes screenshots!

Shared service to generate PNG/PDF snapshots of OCHA websites.

This service is the result of auditing several internally-maintained PDF/PNG generators within OCHA. We consolidated all the common features into one shared service that is highly available for all properties to use simultaneously. If you want a new feature you are welcome to file a ticket in JIRA in the OPS board (specify `SnapService` Component when creating ticket).

:droplet: _Working with Drupal? [Use the `ocha_snap` module to get started quickly](https://github.com/UN-OCHA/ocha_snap)_.

**Table of Contents**

- [API](#api)
  - [Required Parameters](#required-parameters)
  - [Optional Parameters](#optional-parameters)
  - [Headers](#headers)
- [Using Snap Service on your website](#using-snap-service-on-your-website)
  - [Localization](#localization)
  - [Custom Logos](#custom-logos)
  - [Custom Fonts](#custom-fonts)
- [Install / Develop locally](#install--develop-locally)

## API

You **MUST** use `POST /snap` to request Snaps. We do not serve `GET` requests because we want to discourage people hotlinking to Snaps, and also to control bot traffic.

If you still want to use a GET request, you may proxy the request through your server and change the verb to `POST` on your web head before passing the request through to the Snap Service.

#### `POST /snap`

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |**yes**   |_N/A_   |


### Required Parameters

You **MUST** send **ONE** of the following (`url` or `html`).

#### `url`
String representing the webpage URL you want to Snap.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |**yes**¹  |String  |

#### `html`
The URL-encoded HTML you want to render. Send with `Content-Type: application/x-www-form-urlencoded` as your encoding.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |**yes**¹  |String  |

¹ **EITHER** `url` or `html` are required, but send only one of them! If you do not specify either of these, or you specify both, Snap Service will return **`HTTP 422 Unprocessable Entity`**.

#### `service`
While it won't affect the output you receive from Snap Service, this parameter allows our Ops team to monitor and report your usage of the shared Snap service. It also allows us to prioritize support/feature requests.

Must be an alphanumeric string (hyphens, underscores are also allowed) such as `dsreports`, `hr-info` or `hid_api`.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |**yes**   |String  |


### Optional Parameters

Send any combination of the following as querystring parameters. We do our best to validate your input. When found to be invalid, we return **`HTTP 422 Unprocessable Entity`** and the response body will be a JSON object containing all failed validations.

#### `output`
Specify `png` if you want a PNG image or `pdf` for PDF.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |


#### `media`
Specify a CSS Media. Options are `screen` or `print`.

|Default  |Required  |Type    |
|---------|----------|--------|
|`screen` |no        |String  |


#### `width`
Specify a pixel value for the viewport width.

The Snap Service implicitly assumes that you are Snapping a responsive website. if you are having problems with layout, it might resolve things to simply specify a wider `width` that is similar to a desktop monitor, such as `1280` (with a corresponding `height`).

|Default  |Required  |Type    |
|---------|----------|--------|
|`800`    |no        |integer |

#### `height`
Specify a pixel value for the viewport height.

|Default  |Required  |Type    |
|---------|----------|--------|
|`600`    |no        |integer |

#### `scale`
Specify a device scale (pixel density) to control resolution of PNG output.

|Default  |Required  |Type    |
|---------|----------|--------|
|`2`      |no        |Integer |

#### `pdfFormat`

Specify a PDF page format from one of the following options available within Puppeteer:
- `Letter`: 8.5in x 11in
- `Legal`: 8.5in x 14in
- `Tabloid`: 11in x 17in
- `Ledger`: 17in x 11in
- `A0`: 33.1in x 46.8in
- `A1`: 23.4in x 33.1in
- `A2`: 16.5in x 23.4in
- `A3`: 11.7in x 16.5in
- `A4`: 8.27in x 11.7in
- `A5`: 5.83in x 8.27in
- `A6`: 4.13in x 5.83in

|Default  |Required  |Type    |
|---------|----------|--------|
|`A4`     |no        |String  |


#### `pdfLandscape`
Boolean indicating whether the PDF should be Landscape. Defaults to Portrait.

|Default  |Required  |Type    |
|---------|----------|--------|
|`false`  |no        |Boolean |

#### `pdfBackground`
Boolean indicating whether the PDF should print any CSS related to backgrounds. This includes colors, base64-endcoded images that you've supplied, and so forth.

|Default  |Required  |Type    |
|---------|----------|--------|
|`false`  |no        |Boolean |

#### `pdfMarginTop`
Specify the PDF margin-top. Override CSS unit using `pdfMarginUnit`.

|Default  |Required  |Type    |
|---------|----------|--------|
|`0`      |no        |Integer |

#### `pdfMarginRight`
Specify the PDF margin-right. Override CSS unit using `pdfMarginUnit`.

|Default  |Required  |Type    |
|---------|----------|--------|
|`0`      |no        |Integer |

#### `pdfMarginBottom`
Specify the PDF margin-bottom. This is set to a non-zero value to match the majority of our properties which have a common set of info at the bottom of the PDF. You can override the value just like any of the margin params. Override CSS unit using `pdfMarginUnit`.

|Default  |Required  |Type    |
|---------|----------|--------|
|`64`     |no        |Integer |

#### `pdfMarginLeft`
Specify the PDF margin-left. Override CSS unit using `pdfMarginUnit`.

|Default  |Required  |Type    |
|---------|----------|--------|
|`0`      |no        |Integer |

#### `pdfMarginUnit`
Specify the CSS unit of all PDF margins. Must be one of the following: `px`, `mm`, `cm`, `in`.

|Default  |Required  |Type    |
|---------|----------|--------|
|`px`     |no        |String  |

#### `pdfHeader`
Supply inline HTML/CSS to construct a 100% custom PDF Header. The [Puppeteer PDF documentation](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions) contains additional information regarding pagination and other metadata you might want to dynamically generate. It's listed under `headerTemplate` property.

You **MUST** URL-encode this parameter or it will probably contain content that will break your request.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |


#### `pdfFooter`
All capabilities, limitations, and documentation references are identical to `pdfHeader`. [See Puppeteer docs](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions)

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |

#### `selector`
Specify a CSS selector. Send something very specific, such as an `#html-id`. If you send a generic selector that matches many elements on your page, then Snap Service will only return the **FIRST** element that matches your selector.

> :warning: Due to limitations of Chrome Puppeteer, **PDFs cannot render selectors**, only whole pages.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |


#### `logo`
Display your site's logo in the header area of each page on your PDF. See [Custom Logos](#custom-logos) section for instructions on adding your logo to this repository.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |

#### `user`
HTTP Basic Authentication username.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |

#### `pass`
HTTP Basic Authentication password.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |

#### `cookies`
String representing browser cookies. Just send the contents of `document.cookie` from the client-side and it should work.

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |

#### `ua`
String representing the User-Agent making the request. This can come directly from a client, or if you make your Snap request from within a server, use whatever logs you have at your disposal (UA, nginx headers, etc)

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |

#### `delay`
Number of milliseconds of additional delay you'd like to add before taking the screenshot. Must be an integer between 0-10000 inclusive.

|Default  |Required  |Type    |
|---------|----------|--------|
|`0`      |no        |Integer |

#### `debug`
Boolean meant as a developer-facing parameter to increase the amount of info seen in the logs.

|Default  |Required  |Type    |
|---------|----------|--------|
|`false`  |no        |Boolean |

#### `block`
String containing a comma-separated list of strings to search for within domains. When any string you send is found within a request, it will be blocked (e.g. supplying `google` will block all of the following: `google.com`, `fonts.googleapis.com`, `google-analytics.com`).

|Default  |Required  |Type    |
|---------|----------|--------|
|_null_   |no        |String  |

### Headers

- `X-Forwarded-For` — The remote client address making the request. This allows the snap service to log the address.
- `User-Agent` — The remote user-agent of the client making the request. This value is overridden by the `ua` parameter, if present.

## Using Snap Service on your website

The Snap Service will inject a conditional class on the `<html>` element before generating your PNG/PDF request. The class indicates which format is being generated, so you can customize for either one, or both.

```css
html.snap--png .my-selector {
  /* custom CSS for PNG snaps */
}
html.snap--pdf .my-selector {
  /* custom CSS for PDF snaps */
}
html[class^='snap'] .my-selector {
  /* custom CSS for any Snap */
}
```

This class can be used anywhere in your CSS, including within Media Queries (e.g. `@media print`, `@media screen and (min-width: 700px)`, etc).


### Localization

It is up to the requesting service to manage localization of all strings sent to Snap Service. The service is designed to be as agnostic to your website as possible in order to support the broadest set of use-cases. We support a very versatile font-family by default (Roboto) in order to ensure that many character sets are supported.


### Custom Logos

While including remote images in the PDF Header/Footer is **not supported** by Chrome Puppeteer, it is possible to include your site's logo in the header of a PDF. First, make a PR against this repository making the following two changes:

* Add the SVG within the `app/logos` directory.
* Edit the `app/logos/_list.json` to include the parameter value you prefer, plus the filename.

```json
{
  "ocha": {
    "filename": "ocha.svg"
  },
  "hrinfo": {
    "filename": "hr-info.svg"
  }
}
```

⚠️ **NOTE: this file MUST be valid JSON!** That means double-quoted strings and no trailing commas.

⚠️ **NOTE: do not upload anything except SVG.** At the present time SVG is the only filetype we accept.

Once your PR has been deployed, you can activate your logo on PDF Snaps using the `logo` parameter (see [API](#api)) and the value you entered into `logos/_list.json`. The logo can be referenced from within `pdfHeader`/`pdfFooter` by using the following strings:

- `__LOGO_SRC__` — a base64-encoded string representation of your SVG logo.
- `__LOGO_WIDTH__` — the width of your SVG determined by server
- `__LOGO_HEIGHT__` — the height of your SVG determined by server


### Custom Fonts

It's possible to use a limited set of pre-approved custom fonts in your PDF header and footer. Similar to logos, if you'd like to use an a font not listed below, you can submit a PR to this repository in order to check the fonts into version control and expose the font to our server's Chrome instance.

⚠️ **NOTE: the font MUST be open source.** The Snap Service is an open source repository and if your font's license is not open-source compatible then it cannot be included.

Currently available fonts:

- Roboto (v18)
- Roboto Condensed (v16)


## Install / Develop locally

The node container will do all the npm installation for you. No need to do it locally. Just run the Docker commands to get started.

```bash
# installation
vim .env # set BASEDIR
docker-compose build

# development
docker-compose up
```

Now you can `POST` to `localhost:8442/snap` and it should return Snaps to you.

It will probably be necessary to use an app that helps you formulate and store common queries you want to test. Command line tools like `curl` are perfectly capable, but if you want something more visual try [Insomnia](https://insomnia.rest/). It lets you configure everything and save each query for repeated use.
