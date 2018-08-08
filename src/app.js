const express = require('express')
const bodyParser = require('body-parser')
const errorLogger = require('./middleware/errorLogger')
const errorResponder = require('./middleware/errorResponder')
const injectRequestId = require('./middleware/injectRequestId')
const requestLogger = require('./middleware/requestLogger')
const createRouter = require('./router')

function createApp() {
  const app = express()
  app.disable('x-powered-by')

  app.use(injectRequestId())
  app.use(requestLogger())

  app.use(bodyParser.raw({
    // By default body parser matches only when content-type matches this type.
    // We want to proxy body content straight to S3 so we always want to parse the body as raw
    type: () => true,
    limit: '10kb',
  }))

  app.use(createRouter())

  app.use(errorLogger())
  app.use(errorResponder())

  return app
}

module.exports = createApp

