const bunyan = require('bunyan');
const config = require('./config');

const log = bunyan.createLogger({
  name: config.name,
  streams: [
    {
      level: 'info',
      stream: process.stdout,
    },
    {
      level: 'info',
      path: '/var/log/app.log',
    },
  ],
});

module.exports = log;
