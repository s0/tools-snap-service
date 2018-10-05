# Snap Service

Shared service to generate PNG/PDF snapshots of our websites.

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

## API

- `POST` to `/snap`
- `Content-Type: application/x-www-form-urlencoded`

**Parameters:**

- `url` — (**required**) the URL you want to render
- `format` — (default `pdf`) specify `png` if you want a PNG image or `pdf` for PDF
- `user` — (optional) HTTP Basic Authentication username
- `pass` — (optional) HTTP Basic Authentication password

**Examples:** (they won't work when you click because that's `GET` not `POST`)

- http://localhost:8442/print?url=https%3A%2F%2Fexample.com
- http://localhost:8442/print?url=https%3A%2F%2Freports.dev.ahconu.org%2Fcountry%2Fburundi&user=ocha&pass=dev
