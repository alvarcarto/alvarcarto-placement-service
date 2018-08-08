const fs = require('fs')
const _ = require('lodash')
const BPromise = require('bluebird')
const path = require('path')
const gm = require('gm')
const PerspT = require('perspective-transform')
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

  const srcCorners = [0, 0, placementMetadata.width - 1, 0, placementMetadata.width - 1, placementMetadata.height - 1, 0, placementMetadata.height - 1]
  const dstCorners = [
    imageInfo.placement.topLeft.x,
    imageInfo.placement.topLeft.y,
    imageInfo.placement.topRight.x,
    imageInfo.placement.topRight.y,
    imageInfo.placement.bottomRight.x,
    imageInfo.placement.bottomRight.y,
    imageInfo.placement.bottomLeft.x,
    imageInfo.placement.bottomLeft.y,
  ]
  console.log(srcCorners, dstCorners)
  const perspT = PerspT(srcCorners, dstCorners)
  console.log('perspT', perspT.coeffs.join(','))

  gm(imageToPlace, 'image.jpg').write('test.png', function (err) {
    if (!err) console.log('done');
  });

  /*gm(imageToPlace, 'image.jpg').affine(perspT.coeffs.join(',')).transform().write('test.png', function (err) {
    if (!err) console.log('done');
  });
  */


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
