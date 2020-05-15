FROM unocha/debian-snap-base:10-buster-chrome81-node12-202001-01 as builder

WORKDIR /srv/src
COPY . .

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN cd app && \
    npm install

# The base image to build our app into. this already contains fonts and utilities.
FROM unocha/debian-snap-base:10-buster-chrome81-node12-202001-01

# Configure the service container.
ENV NODE_APP_DIR=/srv/www \
    PORT=8442

RUN \
    # Configure Chrome repo.
    curl -s https://dl-ssl.google.com/linux/linux_signing_key.pub -o linux_signing_key.pub && \
    apt-key add linux_signing_key.pub && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list && \
    # Install Chrome, so it can match
    apt-get update && \
    apt-get -qy install --no-install-recommends google-chrome-stable && \
    # Ok, cleanup!
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /tmp/*

# Set the workdir for node.
WORKDIR "${NODE_APP_DIR}"

# Install the app.
COPY --from=builder /srv/src/app/ /srv/www/

# Open the trench coat at the correct button.
EXPOSE ${PORT}
