const Joi = require('joi')
const _ = require('lodash')
const validate = require('express-validation')
const express = require('express')
const place = require('./http/placeHttp')
const config = require('./config')
const ROLES = require('./enum/roles')

const validTokens = config.API_KEY.split(',')

function createRouter() {
  const router = express.Router()

  // Simple token authentication
  router.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey
    if (_.includes(validTokens, apiKey)) {
      req.user = { role: ROLES.ADMIN }
    } else {
      req.user = { role: ROLES.ANONYMOUS }
    }

    return next()
  })

  const placeMapSchema = {
    query: {
      resizeToWidth: Joi.number().min(50).max(1200).optional(),
      resizeToHeight: Joi.number().min(50).max(1200).optional(),
    },
  }
  router.get('/api/place-map/:imageId', validate(placeMapSchema), place.getPlaceMap)

  return router
}

module.exports = createRouter
