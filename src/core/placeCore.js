const fs = require('fs')
const _ = require('lodash')
const BPromise = require('bluebird')
const path = require('path')
const sharp = require('sharp')
const placementGuideCore = require('./placementGuideCore')

function getFilePath(relativePath) {
  return path.join(__dirname, '../../', relativePath)
}

const images = {
  test: {
    imageData: fs.readFileSync(getFilePath('./images/test.jpg')),
  },
}

const placementIm = fs.readFileSync(getFilePath('./images/placement.png'))
placementGuideCore.getPlacementData(placementIm)
  .then((data) => {
    images.test.placement = data
  })
  .catch((err) => {
    throw err
  })


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

async function _render(imageId, imageToPlace) {
  const placementMetadata = await getImageMetadata(imageToPlace)
  const imageInfo = images[imageId]

  const resizedImageToPlace = await _resize(imageToPlace, { resizeToWidth: 800 })
  const resizedMeta = await getImageMetadata(resizedImageToPlace)

  const renderedImage = await sharp(imageInfo.imageData)
    .overlayWith(resizedImageToPlace, {
      top: 0,
      left: 0,
      gravity: sharp.gravity.northwest,
    })
    .png()
    .toBuffer()

  return renderedImage
}

async function render(imageId, imageToPlace, _opts) {
  const opts = _.merge({}, _opts)

  const imageMeta = images[imageId]
  if (!imageMeta) {
    const err = new Error(`Image not found: ${imageId}`)
    err.status = 404
    throw err
  }

  const image = await _render(imageId, imageToPlace)
  const resizedImage = await _resize(image, opts)

  return {
    imageData: resizedImage,
    mimeType: 'image/png',
  }
}

module.exports = {
  render,
}
