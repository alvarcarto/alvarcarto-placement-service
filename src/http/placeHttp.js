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

function getAttachmentName() {
  return 'alvarcarto'
}

const getPlaceUrl = ex.createRoute(async (req, res) => {
  const resizeDefined = _.has(req.query, 'resizeToWidth') || _.has(req.query, 'resizeToHeight')
  const isAnon = _.get(req, 'user.role') !== ROLES.ADMIN
  if (!resizeDefined && isAnon) {
    ex.throwStatus(403, 'Anonymous requests must define a resize parameter.')
  }

  if (isAnon) {
    if (req.query.resizeToWidth && Number(req.query.resizeToWidth) > 1200) {
      ex.throwStatus(403, 'resizeToWidth must be <= 1200')
    }

    if (req.query.resizeToHeight && Number(req.query.resizeToHeight) > 1200) {
      ex.throwStatus(403, 'resizeToHeight must be <= 1200')
    }
  }

  const posterImage = await posterCore.getUrl(req.query.url)
  const rendered = await placeCore.render(req.params.imageId, posterImage, {
    highQuality: !resizeDefined,
    onlyGuideLayer: req.query.onlyGuideLayer,
    resizeToHeight: Number(req.query.resizeToHeight),
    resizeToWidth: Number(req.query.resizeToWidth),
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
  if (!resizeDefined && isAnon) {
    ex.throwStatus(403, 'Anonymous requests must define a resize parameter.')
  }

  if (isAnon) {
    if (req.query.resizeToWidth && Number(req.query.resizeToWidth) > 1200) {
      ex.throwStatus(403, 'resizeToWidth must be <= 1200')
    }

    if (req.query.resizeToHeight && Number(req.query.resizeToHeight) > 1200) {
      ex.throwStatus(403, 'resizeToHeight must be <= 1200')
    }
  }

  const metadata = await placeCore.getMetadata(req.params.imageId)
  const getPosterOpts = resizeDefined
    ? req.query
    : _.merge({}, req.query, {
      resizeToWidth: metadata.width,
      resizeToHeight: metadata.height,
    })
  logger.debug('Downloading poster with options', getPosterOpts)

  const posterImage = await posterCore.getPoster(getPosterOpts)
  const rendered = await placeCore.render(req.params.imageId, posterImage, {
    highQuality: !resizeDefined,
    onlyGuideLayer: req.query.onlyGuideLayer,
    resizeToHeight: Number(req.query.resizeToHeight),
    resizeToWidth: Number(req.query.resizeToWidth),
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

const getImages = ex.createJsonRoute(async () => {
  const images = await assetCore.getListOfAssets()
  return images
})

module.exports = {
  getPlaceMap,
  getPlaceUrl,
  getImages,
}
