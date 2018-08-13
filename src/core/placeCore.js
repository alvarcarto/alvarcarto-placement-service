const _ = require('lodash')
const BPromise = require('bluebird')
const gm = require('gm').subClass({ imageMagick: true })
const sharp = require('sharp')
const logger = require('../util/logger')(__filename)
const assetCore = require('./assetCore')

BPromise.promisifyAll(gm.prototype)

function _resize(image, opts) {
  const sharpImage = sharp(image)
  if (_.isFinite(opts.resizeToWidth)) {
    return sharpImage.resize(opts.resizeToWidth, null).png().toBuffer()
  } else if (_.isFinite(opts.resizeToHeight)) {
    return sharpImage.resize(null, opts.resizeToHeight).png().toBuffer()
  }

  return sharpImage.png().toBuffer()
}

function getImageMetadata(image) {
  return sharp(image).metadata()
}

// https://github.com/aheckmann/gm/issues/572#issuecomment-293768810
function gmToBuffer(data) {
  return new BPromise((resolve, reject) => {
    data.stream((err, stdout, stderr) => {
      if (err) { return reject(err) }

      const chunks = []
      stdout.on('data', (chunk) => { chunks.push(chunk) })
      // these are 'once' because they can and do fire multiple times for multiple errors,
      // but this is a promise so you'll have to deal with them one at a time
      stdout.once('end', () => { resolve(Buffer.concat(chunks)) })
      stderr.once('data', (data) => {
        reject(new Error(data))
      })
    })
  })
}

async function perspectiveTransform(image, viewport, srcCorners, dstCorners, opts = {}) {
  // Syntax for Perspective transform string is a set of coordinates:
  // oldTopLeft newTopLeft oldBottomLeft newBottomLeft oldBottomRight newBottomRight oldTopRight newTopRight
  // Example: "0,0 350,2551 0,8267 976,3893 5905,8267 2874,3324 5905,0 1758,2271"
  const pointsString = _.map(_.flatten(_.zip(srcCorners, dstCorners)), arr => arr.join(',')).join(' ')

  // http://www.imagemagick.org/Usage/distorts/#perspective
  // https://www.imagemagick.org/script/command-line-options.php#distort
  const data = gm(image)
    .command('convert')
    .out('-virtual-pixel', 'white')
    .out('-define', `distort:viewport=${viewport.width}x${viewport.height}`)
    .out('-distort', 'Perspective', pointsString)
    .setFormat('PNG')

  if (!opts.highQuality) {
    data.out('-filter', 'point')
  }

  return gmToBuffer(data)
}

async function _render(imageId, imageToPlace, opts = {}) {
  const imageInfo = await assetCore.getAsset(imageId, {
    minWidth: opts.resizeToWidth,
    minHeight: opts.resizeToHeight,
  })
  const placementMetadata = await getImageMetadata(imageToPlace)

  const srcCorners = [
    [0, 0],
    [0, placementMetadata.height - 1],
    [placementMetadata.width - 1, placementMetadata.height - 1],
    [placementMetadata.width - 1, 0],
  ]
  const dstCorners = [
    [imageInfo.placement.topLeft.x, imageInfo.placement.topLeft.y],
    [imageInfo.placement.bottomLeft.x, imageInfo.placement.bottomLeft.y],
    [imageInfo.placement.bottomRight.x, imageInfo.placement.bottomRight.y],
    [imageInfo.placement.topRight.x, imageInfo.placement.topRight.y],
  ]

  const imageMeta = await getImageMetadata(imageInfo.image)
  const transformed = await perspectiveTransform(imageToPlace, imageMeta, srcCorners, dstCorners, {
    highQuality: opts.highQuality,
  })

  if (opts.onlyPlacementLayer) {
    const onlyPlacementImage = await sharp(transformed)
      .png()
      .toBuffer()

    return onlyPlacementImage
  }

  const renderedImage = await sharp(transformed)
    .overlayWith(imageInfo.image, {
      top: 0,
      left: 0,
      gravity: sharp.gravity.northwest,
    })
    .png()
    .toBuffer()

  return renderedImage
}

async function render(imageId, imageToPlace, _opts) {
  const opts = _.merge({
    highQuality: false,
  }, _opts)

  logger.debug(`Rendering image ${imageId}`)
  const image = await _render(imageId, imageToPlace, opts)
  const resizedImage = await _resize(image, opts)
  const metadata = await getImageMetadata(resizedImage)

  return {
    imageData: resizedImage,
    metadata,
    mimeType: 'image/png',
  }
}

async function getMetadata(imageId, opts = {}) {
  logger.debug(`Getting metadata for ${imageId}`)
  const imageInfo = await assetCore.getAsset(imageId, {
    minWidth: opts.resizeToWidth,
    minHeight: opts.resizeToHeight,
  })

  return imageInfo.metadata
}

module.exports = {
  render,
  getMetadata,
}
