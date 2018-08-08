const fs = require('fs')
const path = require('path')
const BPromise = require('bluebird')
const Jimp = require('jimp')

function getFilePath(relativePath) {
  return path.join(__dirname, '../../', relativePath)
}

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

function findCornerPixel(pixels, predicate) {
  let currentPixel = pixels[0]
  for (let i = 0; i < pixels.length; ++i) {
    const pixel = pixels[i]
    if (predicate(currentPixel, pixel)) {
      currentPixel = pixel
    }
  }
  return currentPixel
}

function findCorners(pixels) {
  const topLeft = findCornerPixel(pixels, (cP, p) => p.x + p.y < cP.x + cP.y)
  const topRight = findCornerPixel(pixels, (cP, p) => -p.x + p.y < -cP.x + cP.y)
  const bottomRight = findCornerPixel(pixels, (cP, p) => p.x + p.y > cP.x + cP.y)
  const bottomLeft = findCornerPixel(pixels, (cP, p) => p.x - p.y < cP.x - cP.y)
  return {
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
  }
}

async function getPlacementData(image) {
  const jimpImage = await Jimp.read(image)

  const pixels = await filterPixels(jimpImage, (r, g, b, a) => !isWhiteOrTransparent(r, g, b, a))
  return findCorners(pixels)
}

module.exports = {
  getPlacementData,
}
