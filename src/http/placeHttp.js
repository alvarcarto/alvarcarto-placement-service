const BPromise = require('bluebird')
const _ = require('lodash')
const fs = require('fs')
const mime = require('mime-types')
const ex = require('../util/express')
const logger = require('../util/logger')(__filename)
const posterCore = require('../core/posterCore')
const placeCore = require('../core/placeCore')
const assetCore = require('../core/assetCore')
const ROLES = require('../enum/roles')

BPromise.promisifyAll(fs)

function assertPosterBlur(posterBlur) {
  const val = Number(posterBlur)
  if (val === 0) {
    return val
  } else if (val < 0.3 || val > 1000) {
    ex.throwStatus(400, 'posterBlur sigma value must be 0 (disabled) or between 0.3 and 1000. See http://sharp.pixelplumbing.com/en/stable/')
  }

  return val
}

function parseColor(color) {
  const rgbRegex = /^rgb\((.*)\)$/
  if (color.match(rgbRegex)) {
    const inside = rgbRegex.exec(color)[1]
    const numbers = _.map(inside.split(','), i => parseFloat(i))
    if (numbers.length !== 3) {
      ex.throwStatus(400, 'RGB color must have exactly 3 numbers')
    }
    return {
      type: 'rgb',
      value: numbers,
    }
  }

  ex.throwStatus(400, 'Incorrect color format! Must be in format rgb(0, 0, 0).')
}

function resolveResize(req) {
  if (!_.isFinite(req.resizeToMax)) {
    // Set default
    req.resizeToMax = 2000
  }

  if (_.isFinite(req.resizeToMax) && req.query.orientation === 'portrait') {
    return _.extend({}, req.query, {
      resizeToHeight: req.resizeToMax,
    })
  } else if (_.isFinite(req.resizeToMax) && req.query.orientation === 'landscape') {
    return _.extend({}, req.query, {
      resizeToWidth: req.resizeToMax,
    })
  }

  return req.query
}

const getPlaceUrl = ex.createRoute(async (req, res) => {
  const resizeDefined = _.has(req.query, 'resizeToWidth') || _.has(req.query, 'resizeToHeight')
  const isAnon = _.get(req, 'user.role') !== ROLES.ADMIN
  if (isAnon) {
    if (!resizeDefined) {
      ex.throwStatus(403, 'Anonymous requests must define a resize parameter.')
    }

    if (_.has(req.query, 'clearCache')) {
      ex.throwStatus(403, 'Anonymous requests cannot clear the cache.')
    }

    if (req.query.resizeToWidth && Number(req.query.resizeToWidth) > 1200) {
      ex.throwStatus(403, 'resizeToWidth must be <= 1200')
    }

    if (req.query.resizeToHeight && Number(req.query.resizeToHeight) > 1200) {
      ex.throwStatus(403, 'resizeToHeight must be <= 1200')
    }
  }

  if (req.query.clearCache) {
    assetCore.clearCache()
  }

  const posterImage = await posterCore.getUrl(req.query.url)
  const rendered = await placeCore.render(req.params.imageId, posterImage, {
    highQuality: !resizeDefined,
    onlyPosterLayer: req.query.onlyPosterLayer,
    format: req.query.format,
    posterBlur: _.isFinite(req.query.posterBlur) ? assertPosterBlur(req.query.posterBlur) : undefined,
    variableBlur: _.isFinite(req.query.variableBlur) ? Number(req.query.variableBlur) : undefined,
    resizeToHeight: _.isFinite(req.query.resizeToHeight) ? Number(req.query.resizeToHeight) : undefined,
    resizeToWidth: _.isFinite(req.query.resizeToWidth) ? Number(req.query.resizeToWidth) : undefined,
  })

  if (req.query.download) {
    const ext = mime.extension(rendered.mimeType)
    res.set('content-disposition', `attachment; filename=${req.params.imageId}.${ext}`)
  }

  res.set('content-type', rendered.mimeType)
  res.send(rendered.imageData)
})

const getPlaceMap = ex.createRoute(async (req, res) => {
  const resizeDefined = _.has(req.query, 'resizeToWidth') || _.has(req.query, 'resizeToHeight')
  const isAnon = _.get(req, 'user.role') !== ROLES.ADMIN
  if (isAnon) {
    if (!resizeDefined) {
      ex.throwStatus(403, 'Anonymous requests must define a resize parameter.')
    }

    if (_.has(req.query, 'clearCache')) {
      ex.throwStatus(403, 'Anonymous requests cannot clear the cache.')
    }

    if (req.query.resizeToWidth && Number(req.query.resizeToWidth) > 1200) {
      ex.throwStatus(403, 'resizeToWidth must be <= 1200')
    }

    if (req.query.resizeToHeight && Number(req.query.resizeToHeight) > 1200) {
      ex.throwStatus(403, 'resizeToHeight must be <= 1200')
    }
  }

  if (req.query.clearCache) {
    assetCore.clearCache()
  }

  const assetInfo = await assetCore.getAsset(req.params.imageId, {
    minWidth: Number(req.query.resizeToHeight),
    minHeight: Number(req.query.resizeToWidth),
  })

  const getPosterOpts = _.merge({}, req.query, {
    resizeToWidth: assetInfo.sceneImageMetadata.width,
    resizeToHeight: assetInfo.sceneImageMetadata.height,
    size: req.query.size || assetInfo.jsonMetadata.posterSize || '50x70cm',
    orientation: req.query.orientation || assetInfo.jsonMetadata.posterOrientation || 'portrait',
    // Use tile renderer for placement when resize parameter is defined
    // This is mandatory when rendering world maps (low zoom level tiles are cached)
    useTileRender: resizeDefined,
  })
  logger.debug('Downloading poster with options', getPosterOpts)

  const posterImage = await posterCore.getPoster(getPosterOpts)
  const rendered = await placeCore.render(req.params.imageId, posterImage, {
    highQuality: !resizeDefined,
    onlyPosterLayer: req.query.onlyPosterLayer,
    format: req.query.format,
    posterBlur: _.isFinite(req.query.posterBlur) ? assertPosterBlur(req.query.posterBlur) : undefined,
    variableBlur: _.isFinite(req.query.variableBlur) ? Number(req.query.variableBlur) : undefined,
    resizeToHeight: _.isFinite(req.query.resizeToHeight) ? Number(req.query.resizeToHeight) : undefined,
    resizeToWidth: _.isFinite(req.query.resizeToWidth) ? Number(req.query.resizeToWidth) : undefined,
  })

  if (req.query.download) {
    const header = req.query.labelHeader ? req.query.labelHeader.toLowerCase() : 'map'
    const name = `${req.params.imageId}-${header}-${rendered.metadata.width}x${rendered.metadata.height}`
    const ext = mime.extension(rendered.mimeType)
    res.set('content-disposition', `attachment; filename=${name}.${ext}`)
  }

  res.set('content-type', rendered.mimeType)
  res.send(rendered.imageData)
})

const getImperfectMap = ex.createRoute(async (req, res) => {
  const isAnon = _.get(req, 'user.role') !== ROLES.ADMIN
  if (isAnon) {
    ex.throwStatus(403, 'Anonymous requests are not allowed.')
  }

  if (req.query.clearCache) {
    assetCore.clearCache()
  }

  logger.debug('Downloading poster with options', req.query)

  const getPosterOpts = resolveResize(req)
  const posterImage = await posterCore.getPoster(getPosterOpts)
  const rendered = await placeCore.renderImperfect(posterImage, {
    format: req.query.format,
    posterBlur: _.isFinite(req.query.posterBlur)
      ? assertPosterBlur(req.query.posterBlur)
      : undefined,
    noiseOpacity: _.isFinite(req.query.noiseOpacity) ? req.query.noiseOpacity : undefined,
    addColor: _.isString(req.query.addColor) ? parseColor(req.query.addColor) : undefined,
    addColorBlendMode: _.isString(req.query.addColorBlendMode)
      ? req.query.addColorBlendMode
      : undefined,
    addColorOpacity: _.isFinite(req.query.addColorOpacity) ? req.query.addColorOpacity : undefined,
  })

  if (req.query.download) {
    const header = req.query.labelHeader ? req.query.labelHeader.toLowerCase() : 'map'
    const name = `${header}-${req.query.size}-${rendered.metadata.width}x${rendered.metadata.height}`
    const ext = mime.extension(rendered.mimeType)
    res.set('content-disposition', `attachment; filename=${name}.${ext}`)
  }

  res.set('content-type', rendered.mimeType)
  res.send(rendered.imageData)
})

const getImages = ex.createJsonRoute(async () => {
  const images = await assetCore.getListOfAssets()
  return images
})

module.exports = {
  getPlaceMap,
  getPlaceUrl,
  getImperfectMap,
  getImages,
}
