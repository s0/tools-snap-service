FROM unocha/nodejs-builder:8.11.3 AS builder

WORKDIR /srv/src
COPY . .

RUN cd app && \
    npm install

FROM unocha/debian-snap-base:0.0.1-201810-01

WORKDIR "${NODE_APP_DIR}"

COPY --from=builder /srv/src/app/ /srv/www/
