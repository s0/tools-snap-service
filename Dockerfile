FROM unocha/debian-snap-base:10-buster-node12-201907-01 as builder

WORKDIR /srv/src
COPY . .

env NODE_ENV=production

RUN cd app && \
    npm install

FROM unocha/debian-snap-base:10-buster-node12-201907-01

WORKDIR "${NODE_APP_DIR}"

COPY --from=builder /srv/src/app/ /srv/www/
