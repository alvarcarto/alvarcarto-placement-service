const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const sharp = require('sharp')
const BPromise = require('bluebird')
const request = require('request-promise')
const logger = require('../util/logger')(__filename)
const placementGuideCore = require('./placementGuideCore')
const config = require('../config')

BPromise.promisifyAll(fs)

const cache = {}

function fileExists(filePath) {
  return fs.statAsync(filePath)
    .then(stats => stats.isFile())
    .catch((err) => {
      if (err.code === 'ENOENT') {
        return false
      }

      throw err
    })
}

function getFilePath(relativePath) {
  const absPath = path.join(__dirname, '../../images', relativePath)
  return absPath
}

async function getAssetFromLocal(fileName) {
  const fullPath = getFilePath(fileName)
  const exists = await fileExists(fullPath)
  if (!exists) {
    return null
  }

  const content = await fs.readFileAsync(fullPath, { encoding: null })
  return content
}

function getAssetFromWeb(fileName) {
  return request({
    url: `${config.ASSETS_BASE_URL}/${fileName}`,
    encoding: null,
  })
    .catch((err) => {
      if (_.includes([401, 403, 404], err.response.statusCode)) {
        return null
      }

      // eslint-disable-next-line
      err.message = err.response.body.toString() || err.message
      throw err
    })
}

async function getFreshAsset(imageId, opts = {}) {
  const fileName = opts.guideLayer
    ? `${imageId}-guide-layer.png`
    : `${imageId}.png`

  const fromLocal = await getAssetFromLocal(fileName)
  if (fromLocal) {
    logger.debug(`Found asset from local: ${fileName}`)
    return fromLocal
  }

  const fromWeb = await getAssetFromWeb(fileName)
  if (fromWeb) {
    logger.debug(`Found asset from web: ${fileName}`)
    return fromWeb
  }

  return null
}

function getImageMetadata(image) {
  return sharp(image).metadata()
}

function findSuitableAssetDescription(assetInfo, opts = {}) {
  if (opts.minWidth) {
    const sortedW = _.sortBy(assetInfo.resizedImages, img => img.metadata.width)
    const foundW = _.find(sortedW, img => img.metadata.width > opts.minWidth)
    if (foundW) {
      logger.debug(
        `Returning suitable resized asset based on minWidth=${opts.minWidth}.`,
        `Resized asset has dimensions ${foundW.metadata.width}x${foundW.metadata.height}`
      )
      return foundW
    }
  }

  if (opts.minHeight) {
    const sortedH = _.sortBy(assetInfo.resizedImages, img => img.metadata.height)
    const foundH = _.find(sortedH, img => img.metadata.height > opts.minHeight)
    if (foundH) {
      logger.debug(
        `Returning suitable resized asset based on minHeight=${opts.minHeight}.`,
        `Resized asset has dimensions ${foundH.metadata.width}x${foundH.metadata.height}`
      )
      return foundH
    }
  }

  logger.debug('Returning original asset')
  return assetInfo.original
}

async function getAsset(imageId, opts = {}) {
  const isCached = _.has(cache, imageId)
  if (isCached) {
    logger.debug(`Found asset description from cache: ${imageId}`)
    return findSuitableAssetDescription(cache[imageId], opts)
  }

  const freshImage = await getFreshAsset(imageId, opts)
  if (!freshImage) {
    const err = new Error(`Image not found: ${imageId}`)
    err.status = 404
    throw err
  }

  const freshGuideLayer = await getFreshAsset(imageId, _.merge({}, opts, { guideLayer: true }))
  if (!freshGuideLayer) {
    const err = new Error(`Image guide layer not found: ${imageId}`)
    err.status = 404
    throw err
  }

  const placementData = await placementGuideCore.getPlacementData(freshGuideLayer)
  const resizedImage = await sharp(freshImage).resize(1200, null).png().toBuffer()
  const resizedGuideLayer = await sharp(freshGuideLayer).resize(1200, null).png().toBuffer()
  const resizedPlacementData = await placementGuideCore.getPlacementData(resizedGuideLayer)
  // In case the original happened to be under 1200px wide, this will get the correct width
  const resizedMetadata = await getImageMetadata(resizedImage)

  const assetInfo = {
    original: {
      image: freshImage,
      placement: placementData,
      metadata: await getImageMetadata(freshImage),
    },
    resizedImages: [{
      metadata: resizedMetadata,
      image: resizedImage,
      placement: resizedPlacementData,
    }],
  }
  cache[imageId] = assetInfo

  return findSuitableAssetDescription(assetInfo, opts)
}

module.exports = {
  getAsset,
}