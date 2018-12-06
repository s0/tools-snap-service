FROM unocha/nodejs-builder:8.11.3 AS builder

WORKDIR /srv/src
COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
env NODE_ENV=production

RUN cd app && \
    npm install

FROM unocha/debian-snap-base:0.0.1-201810-01

WORKDIR "${NODE_APP_DIR}"

COPY --from=builder /srv/src/app/ /srv/www/
