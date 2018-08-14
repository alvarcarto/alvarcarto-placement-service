const _ = require('lodash')
const BPromise = require('bluebird')
const Jimp = require('jimp')
const logger = require('../util/logger')(__filename)

function filterPixels(jimpImage, filter) {
  const pixels = []

  return new BPromise((resolve, reject) => {
    jimpImage.scan(0, 0, jimpImage.bitmap.width, jimpImage.bitmap.height, (x, y, idx) => {
      const red = jimpImage.bitmap.data[idx + 0]
      const green = jimpImage.bitmap.data[idx + 1]
      const blue = jimpImage.bitmap.data[idx + 2]
      const alpha = jimpImage.bitmap.data[idx + 3]

      if (filter(red, green, blue, alpha)) {
        pixels.push({ x, y, color: { r: red, g: green, b: blue, a: alpha } })
      }
    }, (err) => {
      if (err) {
        return reject(err)
      }

      return resolve(pixels)
    })
  })
}

const isWhiteOrTransparent = (r, g, b, a) => {
  const isTransparent = a === 0
  const isWhite = r === 255 && g === 255 && b === 255
  return isWhite || isTransparent
}

const isRed = (r, g, b) => {
  return r > 200 && g < 10 && b < 10
}

const isGreen = (r, g, b) => {
  return r < 10 && g > 200 && b < 10
}

function distance(p1, p2) {
  const xPart = Math.pow(p2.x - p1.x, 2)
  const yPart = Math.pow(p2.y - p1.y, 2)
  return Math.sqrt(xPart + yPart)
}

function findCorners(width, height, pixels) {
  return {
    topLeft: _.minBy(pixels, p => distance(p, { x: 0, y: 0 })),
    bottomLeft: _.minBy(pixels, p => distance(p, { x: 0, y: height - 1 })),
    bottomRight: _.minBy(pixels, p => distance(p, { x: width - 1, y: height - 1 })),
    topRight: _.minBy(pixels, p => distance(p, { x: width - 1, y: 0 })),
  }
}

function findCropArea(width, height, pixels) {
  const topLeft = _.minBy(pixels, p => distance(p, { x: 0, y: 0 }))
  const bottomRight = _.minBy(pixels, p => distance(p, { x: width - 1, y: height - 1 }))

  const cropWidth = bottomRight.x - topLeft.x
  const cropHeight = bottomRight.y - topLeft.y
  return {
    topLeft,
    width: cropWidth,
    height: cropHeight,
  }
}

async function getPlacementData(image) {
  const jimpImage = await Jimp.read(image)

  const pixels = await filterPixels(jimpImage, (r, g, b, a) => isRed(r, g, b, a))
  if (pixels.length > 1000) {
    logger.debug(`Found ${pixels.length} red pixels, too many to show the full array`)
  } else {
    logger.debug(`Found ${pixels.length} red pixels:`, pixels)
  }

  const cornerPixels = findCorners(jimpImage.bitmap.width, jimpImage.bitmap.height, pixels)
  logger.debug('Corner pixels:', cornerPixels)
  return cornerPixels
}

async function getCropData(image) {
  const jimpImage = await Jimp.read(image)

  const pixels = await filterPixels(jimpImage, (r, g, b, a) => isGreen(r, g, b, a))
  if (pixels.length > 1000) {
    logger.debug(`Found ${pixels.length} green pixels, too many to show the full array`)
  } else {
    logger.debug(`Found ${pixels.length} green pixels:`, pixels)
  }

  if (pixels.length < 2) {
    return null
  }

  const cropArea = findCropArea(jimpImage.bitmap.width, jimpImage.bitmap.height, pixels)
  logger.debug('Crop area:', cropArea)
  return cropArea
}

module.exports = {
  getPlacementData,
  getCropData,
}
