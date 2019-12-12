FROM unocha/debian-snap-base:10-buster-chrome80-node12-201912-01 as builder

WORKDIR /srv/src
COPY . .

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN cd app && \
    npm install

FROM unocha/debian-snap-base:10-buster-chrome80-node12-201912-01

WORKDIR "${NODE_APP_DIR}"

COPY --from=builder /srv/src/app/ /srv/www/
