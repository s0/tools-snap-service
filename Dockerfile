FROM unocha/debian-snap-base:10-buster-node12-201907-02 as builder

WORKDIR /srv/src
COPY . .

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN cd app && \
    npm install

FROM unocha/debian-snap-base:10-buster-node12-201907-02

WORKDIR "${NODE_APP_DIR}"

COPY --from=builder /srv/src/app/ /srv/www/
