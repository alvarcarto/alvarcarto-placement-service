const {
  getOptionalEnv,
  getRequiredEnv,
  string,
  boolean,
  number,
} = require('./util/env')
require('dotenv').config()

const config = {
  // Required
  API_KEY: getRequiredEnv('API_KEY', string),
  ALVARCARTO_RENDER_API_BASE_URL: getRequiredEnv('ALVARCARTO_RENDER_API_BASE_URL', string),
  ALVARCARTO_RENDER_API_KEY: getRequiredEnv('ALVARCARTO_RENDER_API_KEY', string),
  AWS_ACCESS_KEY_ID: getRequiredEnv('AWS_ACCESS_KEY_ID', string),
  AWS_SECRET_ACCESS_KEY: getRequiredEnv('AWS_SECRET_ACCESS_KEY', string),
  AWS_S3_BUCKET_NAME: getRequiredEnv('AWS_S3_BUCKET_NAME', string),

  // Optional
  PORT: getOptionalEnv('PORT', number, 4000),
  NODE_ENV: getOptionalEnv('NODE_ENV', string, 'development'),
  ALLOW_ANONYMOUS_ADMIN: getOptionalEnv('ALLOW_ANONYMOUS_ADMIN', boolean, false),
  LOG_LEVEL: getOptionalEnv('LOG_LEVEL', string, 'info'),
  AWS_DEBUG: getOptionalEnv('AWS_DEBUG', boolean, false),
  AWS_REGION: getOptionalEnv('AWS_REGION', string, 'eu-west-1'),
}

module.exports = config
