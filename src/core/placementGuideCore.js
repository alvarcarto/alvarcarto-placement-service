const util = require('util')
const _ = require('lodash')
const BPromise = require('bluebird')
const Jimp = require('jimp')

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

function sortCounterClockwise(topLeft, pixels) {
  const centerX = _.sumBy(pixels, p => p.x) / pixels.length
  const centerY = _.sumBy(pixels, p => p.y) / pixels.length

  // Sort based on the angle from center coordinate
  // https://stackoverflow.com/questions/1709283/how-can-i-sort-a-coordinate-list-for-a-rectangle-counterclockwise
  const sorted = _.sortBy(pixels, (p) => {
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atan2#Description
    const normalizedAngle = (Math.atan2(p.x - centerX, p.y - centerY) + (2 * Math.PI)) % (2 * Math.PI)
    return normalizedAngle
  })

  const index = _.findIndex(sorted, p => p.x === topLeft.x && p.y === topLeft.y)
  if (index === -1) {
    throw new Error(`topLeft coordinate not found from pixels: ${util.inspect(topLeft)} ${util.inspect(pixels)}`)
  }

  return {
    topLeft: sorted[index],
    bottomLeft: sorted[(index + 1) % sorted.length],
    bottomRight: sorted[(index + 2) % sorted.length],
    topRight: sorted[(index + 3) % sorted.length],
  }
}

function findCorners(pixels) {
  const minX = _.minBy(pixels, p => p.x)
  const maxY = _.maxBy(pixels, p => p.y)
  const maxX = _.maxBy(pixels, p => p.x)
  const minY = _.minBy(pixels, p => p.y)
  const topLeft = _.minBy([minX, maxY, maxX, minY], p => p.x + p.y)

  return sortCounterClockwise(topLeft, [minX, maxY, maxX, minY])
}

async function getPlacementData(image) {
  const jimpImage = await Jimp.read(image)

  const pixels = await filterPixels(jimpImage, (r, g, b, a) => !isWhiteOrTransparent(r, g, b, a))
  return findCorners(pixels)
}

module.exports = {
  getPlacementData,
}
