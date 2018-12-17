# Snap Service

> 🤔 How does a computer get drunk?
>
> 🤣 It takes screenshots!

Shared service to generate PNG/PDF snapshots of our websites.

## API

- `POST` to `/snap`
- `Content-Type: application/x-www-form-urlencoded`

**Parameters:**

- `url` — (**required**) the URL you want to render.
- `output` — (default `pdf`) specify `png` if you want a PNG image or `pdf` for PDF.
- `media` — (default `screen`) specify a CSS Media. Only other option is `print`.
- `width` — (default `800`) specify a pixel value for the viewport width.
- `height` — (default `600`) specify a pixel value for the viewport height.
- `scale` — (default `2`) specify a device scale (pixel density) to control resolution of PNG output.
- `format` — (default `A4`) specify a PDF page format from one of the following options available within Puppeteer:
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
- `selector` — (optional) specify a CSS selector. Snap Service will return ONLY the first element which matches your selector.
- `logo` — (optional) Display your site's logo in the header area of each page on your PDF. See [Custom Logos](#custom-logos) section for instructions on adding your logo to this repository.
- `user` — (optional) HTTP Basic Authentication username.
- `pass` — (optional) HTTP Basic Authentication password.
- `cookies` — (optional) a String representing browser cookies. Just send the contents of `document.cookie` and it should work.
- `headerTitle` — (optional) Specify a Header Title for each page of the PDF. ASCII characters allowed, and input will be HTML-encoded.
- `headerSubtitle` — (optional) Specify a Header Subtitle for each page of the PDF. ASCII characters allowed, and input will be HTML-encoded.
- `headerDescription` — (optional) Specify a Header Description for each page of the PDF. ASCII characters allowed, and input will be HTML-encoded.
- `footerText` — (optional) Specify custom Footer text for each page of the PDF. ASCII characters allowed, and input will be HTML-encoded.

We do our best to validate your input. When found to be invalid, we return **HTTP 422 Unprocessable Entity** and the response body will be a JSON object containing all failed validations.

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

### Custom Logos

It's possible to include your site's logo in the header of a PDF. First, make a PR against this repository making the following two changes:

* Add the file to `app/logos` directory.
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

⚠️ **NOTE: do not upload anything except SVG.** At the present time this is the only filetype we accept.

Once your PR has been deployed, you can activate your logo on PDF Snaps using the `logo` parameter (see [API](#api)) and the value you entered into `logos/_list.json`.

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

To use nodemon and have the service restart automatically as you edit the code, edit `debian-snapper-nodejs/run_node` and change the last command to `exec npm dev`.

It will probably be necessary to use an app that helps you formulate and store common queries you want to test. Command line tools like `curl` are perfectly capable, but if you want something more visual try [Insomnia](https://insomnia.rest/). It lets you configure everything and save each query for repeated use.
