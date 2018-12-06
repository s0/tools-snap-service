const nodeEnv = process.env.NODE_ENV || 'dockerdev';
const config = {
  dockerdev: require('./dockerdev'),
  production: require('./production'),
};

module.exports = config[nodeEnv];
