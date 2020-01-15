# Snap Service

> 🤔 How does a computer get drunk?
>
> 🤣 It takes screenshots!

Shared service to generate PNG/PDF snapshots of our websites.

## API

- `POST` to `/snap`
- `Content-Type: application/x-www-form-urlencoded`

### URL or HTML input

One of the following two inputs is **required**:

- `url` — (querystring parameter) the remote URL you want to render.
- `html` — (urlencoded form data) the URL-encoded HTML you want to render.

If you do not specify either of these, or specify both, Snap Service will return **`HTTP 422 Unprocessable Entity`**.

### Parameters

Send any combination of the following as querystring parameters:

- `service` — (**recommended**) an alphanumeric identifier for the requesting service. You can more easily generate usage reports by specifying the requesting service. Must be an alphanumeric string (hyphens, underscores are also allowed) such as `dsreports`, `hr-info` or `hid_api`.
- `output` — (default `pdf`) specify `png` if you want a PNG image or `pdf` for PDF.
- `media` — (default `screen`) specify a CSS Media. Only other option is `print`.
- `width` — (default `800`) specify a pixel value for the viewport width.
- `height` — (default `600`) specify a pixel value for the viewport height.
- `scale` — (default `2`) specify a device scale (pixel density) to control resolution of PNG output.
- `pdfFormat` — (default `A4`) specify a PDF page format from one of the following options available within Puppeteer:
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
- `pdfLandscape` — (default `false`) a Boolean indicating whether the PDF should be Landscape. Defaults to Portrait.
- `pdfBackground` — (default `false`) a Boolean indicating whether the PDF should print any CSS related to backgrounds. This includes colors, base64-endcoded images that you've supplied, and so forth.
- `pdfMarginTop` (default `0`) set the PDF margin-top. Override CSS unit using `pdfMarginUnit`.
- `pdfMarginRight` (default `0`) set the PDF margin-right. Override CSS unit using `pdfMarginUnit`.
- `pdfMarginBottom` (default `64`) set the PDF margin-bottom. This is set to a non-zero value to match the majority of our properties which have a common set of info at the bottom of the PDF. You can override the value just like any of the margin params. Override CSS unit using `pdfMarginUnit`.
- `pdfMarginLeft` (default `0`) set the PDF margin-left. Override CSS unit using `pdfMarginUnit`.
- `pdfMarginUnit` (default `px`) set the CSS unit of all PDF margins. Must be one of the following: `px`, `mm`, `cm`, `in`.
- `pdfHeader` — (optional) inline HTML/CSS to construct a 100% custom PDF Header. The [Puppeteer PDF documentation](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions) contains additional information regarding pagination and other metadata you might want to dynamically generate. It's listed under `headerTemplate` property.
- `pdfFooter` — (optional) all capabilities, limitations, and documentation references are identical to `pdfHeader`
- `selector` — (optional) specify a CSS selector. Snap Service will return ONLY the first element which matches your selector. _NOTE: due to limitations of Chrome Puppeteer, **PDFs cannot render selectors, only whole pages.**_
- `logo` — (optional) Display your site's logo in the header area of each page on your PDF. See [Custom Logos](#custom-logos) section for instructions on adding your logo to this repository.
- `user` — (optional) HTTP Basic Authentication username.
- `pass` — (optional) HTTP Basic Authentication password.
- `cookies` — (optional) a String representing browser cookies. Just send the contents of `document.cookie` and it should work.
- `ua` — (optional) a String representing the User-Agent making the request. This can come directly from a client, or if you make your Snap request from within a server, use whatever logs you have at your disposal (UA, nginx headers, etc)
- `delay` — (optional) a Number of milliseconds of additional delay you'd like to add before taking the screenshot. Must be an integer between 0-10000 inclusive.
- `debug` — (optional) a Boolean meant as a developer-facing parameter to increase the amount of info seen in the logs.
- `block` — (optional) a String containing a comma-separated list of strings to search for within domains. When any string you send is found within a request, it will be blocked (e.g. supplying `google` will block all of the following: `google.com`, `fonts.googleapis.com`, `google-analytics.com`).

We do our best to validate your input. When found to be invalid, we return **`HTTP 422 Unprocessable Entity`** and the response body will be a JSON object containing all failed validations.

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

It is up to the requesting service to manage localization of all strings sent to Snap Service. The service is designed to be as agnostic to your website as possible in order to support the broadest set of use-cases.


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


## Install / Develop

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
