const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const sharp = require('sharp')
const BPromise = require('bluebird')
const request = require('request-promise')
const { createS3 } = require('../util/aws')
const logger = require('../util/logger')(__filename)
const placementGuideCore = require('./placementGuideCore')
const config = require('../config')

const s3 = createS3()

BPromise.promisifyAll(fs)

let cache = {}

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

function createS3Url(key) {
  return `https://s3-${config.AWS_REGION}.amazonaws.com/${config.AWS_S3_BUCKET_NAME}/${key}`
}

function getAssetFromS3(fileName) {
  return request({
    url: createS3Url(`images/${fileName}`),
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

async function getFreshAsset(fileName, opts = {}) {
  const fromLocal = await getAssetFromLocal(fileName)
  if (fromLocal) {
    logger.debug(`Fetched asset from local disk: ${fileName}`)
    return fromLocal
  }

  const fromS3 = await getAssetFromS3(fileName)
  if (fromS3) {
    logger.debug(`Fetched asset from S3: ${fileName}`)
    return fromS3
  }

  if (opts.ignoreNotFound) {
    return null
  }

  const err = new Error(`Asset with id ${fileName} not found`)
  err.status = 404
  throw err
}

function getImageMetadata(image) {
  return sharp(image).metadata()
}

function fetchAssetJson(url) {
  return request({ url, json: true })
    .catch((err) => {
      logger.error(`Did not find a json at ${url}`)
      throw err
    })
}

async function getListOfS3Assets() {
  const listOpts = {
    Bucket: config.AWS_S3_BUCKET_NAME,
    MaxKeys: 1000,
    Prefix: 'images/',
  }

  const result = await s3.listObjectsV2Async(listOpts)
  const jsonFiles = _.filter(result.Contents, s3Obj => _.endsWith(s3Obj.Key, '.json'))

  const assets = await BPromise.map(jsonFiles, async (s3Object) => {
    const assetMeta = await fetchAssetJson(createS3Url(s3Object.Key))
    const id = path.basename(s3Object.Key, '.json')
    return _.merge({}, assetMeta, {
      id,
      smallPhotoUrl: `https://alvarcarto-placement.imgix.net/${id}.png?w=300`,
    })
  })

  return assets
}

function findSuitableAssetDescription(assetInfo, opts = {}) {
  if (opts.minWidth) {
    const sortedW = _.sortBy(assetInfo.resizedImages, img => img.sceneImageMetadata.width)
    const foundW = _.find(sortedW, img => img.sceneImageMetadata.width >= opts.minWidth)
    if (foundW) {
      logger.debug(
        `Returning suitable resized asset based on minWidth=${opts.minWidth}.`,
        `Resized asset has dimensions ${foundW.sceneImageMetadata.width}x${foundW.sceneImageMetadata.height}`
      )
      return foundW
    }
  }

  if (opts.minHeight) {
    const sortedH = _.sortBy(assetInfo.resizedImages, img => img.sceneImageMetadata.height)
    const foundH = _.find(sortedH, img => img.sceneImageMetadata.height >= opts.minHeight)
    if (foundH) {
      logger.debug(
        `Returning suitable resized asset based on minHeight=${opts.minHeight}.`,
        `Resized asset has dimensions ${foundH.sceneImageMetadata.width}x${foundH.sceneImageMetadata.height}`
      )
      return foundH
    }
  }

  logger.debug('Returning original asset')
  return assetInfo.original
}


function scaleCoord(coord, ratios) {
  return {
    x: Math.round(ratios.width * coord.x),
    y: Math.round(ratios.height * coord.y),
  }
}

async function createResizeAssetDescription(originalAssetDescription, newDimensions) {
  const originalMetadata = originalAssetDescription.sceneImageMetadata
  const resizedScene = await sharp(originalAssetDescription.sceneImage)
    .resize(newDimensions.width, newDimensions.height)
    .png()
    .toBuffer()
  // In case the original happened to be under the resize dimensions, this will get the correct
  // dimensions
  const resizedSceneMetadata = await getImageMetadata(resizedScene)
  const variableBlurImage = originalAssetDescription.instructions.variableBlurImage
    ? await sharp(originalAssetDescription.instructions.variableBlurImage)
      .resize(newDimensions.width, newDimensions.height)
      .png()
      .toBuffer()
    : null

  const ratios = {
    width: resizedSceneMetadata.width / originalMetadata.width,
    height: resizedSceneMetadata.height / originalMetadata.height,
  }

  return {
    sceneImage: resizedScene,
    sceneImageMetadata: await getImageMetadata(resizedScene),
    jsonMetadata: originalAssetDescription.jsonMetadata,
    instructions: {
      // Has to be calculated precisely because resizing blurs the corner pixels in the guide layer
      // This actually makes the crop area a bit larger and the crop area is too large, background
      // leaks behind it.
      placement: {
        topLeft: scaleCoord(originalAssetDescription.instructions.placement.topLeft, ratios),
        bottomLeft: scaleCoord(originalAssetDescription.instructions.placement.bottomLeft, ratios),
        bottomRight: scaleCoord(originalAssetDescription.instructions.placement.bottomRight, ratios),
        topRight: scaleCoord(originalAssetDescription.instructions.placement.topRight, ratios),
      },
      crop: originalAssetDescription.instructions.crop
        ? {
          topLeft: scaleCoord(originalAssetDescription.instructions.crop.topLeft, ratios),
          width: Math.round(ratios.width * originalAssetDescription.instructions.crop.width),
          height: Math.round(ratios.height * originalAssetDescription.instructions.crop.height),
        }
        : null,
      variableBlurImage,
    },
  }
}

async function getAssetJsonMetadata(imageId) {
  const data = await getFreshAsset(`${imageId}.json`)
  try {
    return JSON.parse(data.toString())
  } catch (err) {
    logger.error(`Invalid JSON found from ${imageId}.json`, data)
    throw err
  }
}

async function getAsset(imageId, opts = {}) {
  const isCached = _.has(cache, imageId)
  if (isCached) {
    logger.debug(`Found asset description from cache: ${imageId}`)
    return findSuitableAssetDescription(cache[imageId], opts)
  }

  const freshImage = await getFreshAsset(`${imageId}.png`)
  const freshGuideLayer = await getFreshAsset(`${imageId}-guide-layer.png`)
  const freshBlurLayer = await getFreshAsset(`${imageId}-blur-layer.png`, { ignoreNotFound: true })

  logger.debug(`Get placement data for original ${imageId}`)
  const originalAssetDescription = {
    sceneImage: freshImage,
    sceneImageMetadata: await getImageMetadata(freshImage),
    jsonMetadata: await getAssetJsonMetadata(imageId),
    instructions: {
      placement: await placementGuideCore.getPlacementData(freshGuideLayer),
      crop: await placementGuideCore.getCropData(freshGuideLayer),
      variableBlurImage: freshBlurLayer,
    }
  }

  const assetInfo = {
    original: originalAssetDescription,
    resizedImages: await BPromise.map([1200], width => createResizeAssetDescription(
      originalAssetDescription,
      { width, height: null },
    )),
  }
  cache[imageId] = assetInfo

  return findSuitableAssetDescription(assetInfo, opts)
}

function clearCache() {
  logger.info('Asset cache cleared')
  cache = {}
}

module.exports = {
  getAsset,
  getListOfAssets: getListOfS3Assets,
  clearCache,
}
