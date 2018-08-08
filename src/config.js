const {
  getOptionalEnv,
  getRequiredEnv,
  string,
  number,
} = require('./util/env')
require('dotenv').config()

const config = {
  // Required
  API_KEY: getRequiredEnv('API_KEY', string),
  ALVARCARTO_RENDER_API_BASE_URL: getRequiredEnv('ALVARCARTO_RENDER_API_BASE_URL', string),
  ALVARCARTO_RENDER_API_KEY: getRequiredEnv('ALVARCARTO_RENDER_API_KEY', string),

  // Optional
  PORT: getOptionalEnv('PORT', number, 4000),
  NODE_ENV: getOptionalEnv('NODE_ENV', string, 'development'),
  LOG_LEVEL: getOptionalEnv('LOG_LEVEL', string, 'info'),
}

module.exports = config
