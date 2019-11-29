const Joi = require('joi')
const _ = require('lodash')
const validate = require('express-validation')
const express = require('express')
const place = require('./http/placeHttp')
const config = require('./config')
const ROLES = require('./enum/roles')

const validTokens = config.API_KEY.split(',')

function _requireRole(role) {
  return function middleware(req, res, next) {
    if (_.get(req, 'user.role') !== role) {
      const err = new Error('Unauthorized')
      err.status = 401
      return next(err)
    }

    return next()
  }
}

function createRouter() {
  const router = express.Router()

  // Simple token authentication
  router.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey
    if (config.ALLOW_ANONYMOUS_ADMIN || _.includes(validTokens, apiKey)) {
      req.user = { role: ROLES.ADMIN }
    } else {
      req.user = { role: ROLES.ANONYMOUS }
    }

    return next()
  })

  router.get('/api/images', place.getImages)

  const placeMapSchema = {
    query: {
      resizeToWidth: Joi.number().min(50).optional(),
      resizeToHeight: Joi.number().min(50).optional(),
      // We scale the value to sharp's sigma range which is 0.3 - 1000
      posterBlur: Joi.number().min(0).max(999.7).optional(),
      variableBlur: Joi.number().min(0).max(100).optional(),
      onlyPosterLayer: Joi.boolean().optional(),
      clearCache: Joi.boolean().optional(),
      format: Joi.string().valid(['png', 'jpg', 'webp']).optional(),
    },
  }
  router.get('/api/place-map/:imageId', validate(placeMapSchema), place.getPlaceMap)

  const placeUrlSchema = {
    query: {
      resizeToWidth: Joi.number().min(50).optional(),
      resizeToHeight: Joi.number().min(50).optional(),
      posterBlur: Joi.number().min(0).max(999.7).optional(),
      variableBlur: Joi.number().min(0).max(100).optional(),
      url: Joi.string(),
      onlyPosterLayer: Joi.boolean().optional(),
      clearCache: Joi.boolean().optional(),
      format: Joi.string().valid(['png', 'jpg', 'webp']).optional(),
    },
  }
  router.get('/api/place-url/:imageId', _requireRole(ROLES.ADMIN), validate(placeUrlSchema), place.getPlaceUrl)

  return router
}

module.exports = createRouter
