const BPromise = require('bluebird')
const path = require('path')
const _ = require('lodash')
const fs = require('fs')
const ex = require('../util/express')
const mime = require('mime-types')
const posterCore = require('../core/posterCore')
const placeCore = require('../core/placeCore')
const ROLES = require('../enum/roles')

BPromise.promisifyAll(fs)

const getPlaceMap = ex.createRoute(async (req, res) => {
  const resizeDefined = _.has(req.query, 'resizeToWidth') || _.has(req.query, 'resizeToHeight')
  if (!resizeDefined && _.get(req, 'user.role') !== ROLES.ADMIN) {
    return ex.throwStatus(403, 'Anonymous requests must define a resize parameter.')
  }

  const posterImage = await posterCore.getPoster(req.query)
  const rendered = await placeCore.render(req.params.imageId, posterImage)

  if (req.query.download) {
    const name = getAttachmentName(opts)
    const ext = mime.extension(rendered.mimeType)
    res.set('content-disposition', `attachment filename=${name}.${ext}`)
  }

  res.set('content-type', rendered.mimeType)
  res.send(rendered.imageData)
})

function getAttachmentName(opts) {
  return `download`
}

module.exports = {
  getPlaceMap,
}
