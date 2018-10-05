const nodeEnv = process.env.NODE_ENV || 'dockerdev';
const config = {
  dockerdev: require('./dockerdev'),
};

module.exports = config[nodeEnv];
