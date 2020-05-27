const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const uuidv4 = require('uuid/v4')
const BPromise = require('bluebird')
const gm = require('gm').subClass({ imageMagick: true })
const sharp = require('sharp')
const logger = require('../util/logger')(__filename)
const assetCore = require('./assetCore')

const TEMP_DIR = path.join(__dirname, '../../tmp')

BPromise.promisifyAll(gm.prototype)
BPromise.promisifyAll(fs)

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
      if (err) {
        logger.error('Imagemagick error:', err)
        return reject(err)
      }

      const chunks = []
      stdout.on('data', (chunk) => { chunks.push(chunk) })
      // these are 'once' because they can and do fire multiple times for multiple errors,
      // but this is a promise so you'll have to deal with them one at a time
      stdout.once('end', () => { resolve(Buffer.concat(chunks)) })
      stderr.once('data', (data) => {
        logger.error('Imagemagick error (stdout):', data)
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


function deleteTempFile(fileName) {
  fs.unlinkAsync(path.join(TEMP_DIR, fileName))
    .catch((err) => {
      if (err.code !== 'ENOENT') {
        throw err
      }
    })
}

async function createTempFile(data, ext) {
  const extString = ext ? `.${ext}` : ''
  const filePath = path.join(TEMP_DIR, `${uuidv4()}${extString}`)
  if (data) {
    await fs.writeFileAsync(filePath, data, { encoding: null })
  }

  return filePath
}

function withTempFile(data, ext, func) {
  let createdFilePath
  return createTempFile(data, ext)
    .then((filePath) => {
      createdFilePath = filePath
      return func(filePath)
    })
    .finally(() => deleteTempFile(createdFilePath))
}


async function applyVariableBlur(image, blurImage, _opts = {}) {
  const opts = _.merge({
    blurSigma: 5,
  }, _opts)

  const data = await withTempFile(blurImage, 'png', (filePath) => {
    // http://www.imagemagick.org/Usage/mapping/#blur
    return gm(image)
      .command('convert')
      .out(filePath)
      .out('-compose', 'blur')
      .out('-define', `compose:args=0x${opts.blurSigma}`)
      .out('-composite')
      .setFormat('PNG')
  })

  return gmToBuffer(data)
}

async function generateNoise(width, height, opacity = 0.1) {
  const im = gm(width, height, '#999999')
    .out('+noise', 'poisson')
    .out('-channel', 'green')
    .out('-separate')
    .setFormat('PNG24')

  const noiseIm = await gmToBuffer(im)

  const noiseWithAlpha = await sharp(noiseIm)
    .composite([{
      input: Buffer.from([255, 255, 255, opacity * 255]),
      raw: {
        width: 1,
        height: 1,
        channels: 4
      },
      tile: true,
      blend: 'dest-in'
    }])
    .png()
    .toBuffer()

  return noiseWithAlpha
}

async function addNoise(image, _opts = {}) {
  const opts = _.merge({
    opacity: 0.1,
  }, _opts)

  const metadata = await sharp(image).metadata()
  const noise = await generateNoise(metadata.width, metadata.height, opts.opacity)

  const final = await sharp(image)
    .composite([{
      input: noise,
      top: 0,
      left: 0,
      gravity: sharp.gravity.northwest,
    }])
    .png()
    .toBuffer()

  return final
}

async function addHintOfColor(image, rgb, _opts = {}) {
  const opts = _.merge({
    opacity: 0.1,
  }, _opts)

  const [r, g, b] = rgb

  const colorized = await sharp(image)
    .composite([{
      input: Buffer.from([r, g, b, opts.opacity * 255]),
      raw: {
        width: 1,
        height: 1,
        channels: 4
      },
      tile: true,
      blend: 'over'
    }])
    .png()
    .toBuffer()

  return colorized
}

function getResizePixelRatio(oldDimensions, newDimensions) {
  const oldPixels = oldDimensions.width * oldDimensions.height
  if (newDimensions.width) {
    const ratio = newDimensions.width / oldDimensions.width
    const newHeight = ratio * oldDimensions.height
    return (newDimensions.width * newHeight) / oldPixels
  } else if (newDimensions.height) {
    const ratio = newDimensions.height / oldDimensions.height
    const newWidth = ratio * oldDimensions.width
    return (newDimensions.height * newWidth) / oldPixels
  }

  return 1
}

function calculateSharpBlur(blurSigma, ratio) {
  const newSigma = blurSigma * ratio
  if (newSigma < 0.3) {
    logger.warn(`Poster blur sigma would be under 0.3 (${newSigma}), so will set it to 0`)
    // If it'll be very small, let's just put it to zero. Resizing the image will also
    // blur the poster a bit
    return 0
  }

  return newSigma
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

  const { placement } = imageInfo.instructions
  const dstCorners = [
    [placement.topLeft.x, placement.topLeft.y],
    [placement.bottomLeft.x, placement.bottomLeft.y],
    [placement.bottomRight.x, placement.bottomRight.y],
    [placement.topRight.x, placement.topRight.y],
  ]

  const { jsonMetadata, sceneImageMetadata } = imageInfo
  const transformed = await perspectiveTransform(imageToPlace, sceneImageMetadata, srcCorners, dstCorners, {
    highQuality: opts.highQuality,
  })

  const originalImageInfo = await assetCore.getAsset(imageId)
  const resizeRatio = getResizePixelRatio(originalImageInfo.sceneImageMetadata, {
    width: opts.resizeToWidth,
    height: opts.resizeToHeight,
  })
  logger.debug(`Resize ratio is ${resizeRatio}`)

  let blurred = transformed
  const shouldBlur = opts.posterBlur || jsonMetadata.posterBlur
  const posterBlurSigma = _.isFinite(opts.posterBlur) ? opts.posterBlur : jsonMetadata.posterBlur
  const calculatedPosterBlurSigma = calculateSharpBlur(posterBlurSigma, resizeRatio)
  if (shouldBlur && calculatedPosterBlurSigma > 0) {
    const blurSource = opts.posterBlur ? 'request options' : 'json metadata'
    logger.debug(`Blurring poster for ${imageId} with ${posterBlurSigma} from ${blurSource}`)

    blurred = await sharp(transformed)
      // Minumum sigma value is 0.3
      .blur(calculatedPosterBlurSigma)
      .png()
      .toBuffer()
  }

  logger.debug(`Poster layer resolution: ${placementMetadata.width}x${placementMetadata.height}`)
  logger.debug(`Scene layer resolution:  ${sceneImageMetadata.width}x${sceneImageMetadata.height}`)
  const { variableBlurImage } = imageInfo.instructions

  if (opts.onlyPosterLayer) {
    const onlyPlacementImage = await sharp(blurred)
      .png()
      .toBuffer()

    if (variableBlurImage) {
      logger.warn('Skipping variable blur apply step because onlyPosterLayer=true')
    }

    return {
      rendered: onlyPlacementImage,
      imageInfo,
    }
  }

  let renderedImage
  if (imageInfo.jsonMetadata.type === 'plywood') {
    renderedImage = await sharp(imageInfo.sceneImage)
      .composite([{
        input: blurred,
        blend: 'multiply',
        top: 0,
        left: 0,
        gravity: sharp.gravity.northwest,
      }])
      .png()
      .toBuffer()
  } else {
    renderedImage = await sharp(blurred)
      .composite([{
        input: imageInfo.sceneImage,
        top: 0,
        left: 0,
        gravity: sharp.gravity.northwest,
      }])
      .png()
      .toBuffer()
  }

  let variableBlurredImage = renderedImage
  const variableBlurSigma = _.isFinite(opts.variableBlur)
    ? opts.variableBlur
    : _.isFinite(jsonMetadata.variableBlur)
      ? jsonMetadata.variableBlur
      : 3
  if (variableBlurImage && variableBlurSigma > 0) {
    const variableBlurImageMetadata = await getImageMetadata(variableBlurImage)
    const dimensionStr = `${variableBlurImageMetadata.width}x${variableBlurImageMetadata.height}`
    const blurSource = opts.variableBlur
      ? 'request options'
      : jsonMetadata.variableBlur
        ? 'json metadata'
        : 'default value'

    logger.debug(`Applying variable blur layer (${dimensionStr}) with sigma ${variableBlurSigma} from ${blurSource}`)

    variableBlurredImage = await applyVariableBlur(renderedImage, variableBlurImage, {
      blurSigma: variableBlurSigma * resizeRatio,
    })
  }

  return {
    rendered: variableBlurredImage,
    imageInfo,
  }
}

function formatToMimeType(format) {
  switch (format) {
    case 'png': return 'image/png'
    case 'jpg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    default: throw new Error(`Unknown format: ${format}`)
  }
}

function getFormatOptions(format) {
  switch (format) {
    case 'jpg': return { quality: 95, chromaSubsampling: '4:4:4' }
    default: return undefined
  }
}

async function renderImperfect(posterImage, _opts) {
  const opts = _.merge({
    format: 'jpg',
    noiseOpacity: 0.1,
    addColor: null,
    addColorOpacity: 0.1,
  }, _opts)

  logger.info(`Rendering imperfect map with options ${JSON.stringify(opts, null, 2)}`)

  const posterMeta = await sharp(posterImage).metadata()
  const resizeRatio = getResizePixelRatio(posterMeta, {
    width: opts.resizeToWidth,
    height: opts.resizeToHeight,
  })
  logger.debug(`Resize ratio is ${resizeRatio}`)

  let imperfectImage = posterImage

  const posterBlurSigma = _.isFinite(opts.posterBlur) ? opts.posterBlur : 0.3
  const calculatedPosterBlurSigma = calculateSharpBlur(posterBlurSigma, resizeRatio)
  if (calculatedPosterBlurSigma > 0) {
    logger.debug(`Blurring poster with ${posterBlurSigma}`)

    imperfectImage = await sharp(imperfectImage)
      // Minumum sigma value is 0.3
      .blur(calculatedPosterBlurSigma)
      .png()
      .toBuffer()
  }

  logger.debug(`Adding noise with opacity ${opts.noiseOpacity}`)
  imperfectImage = await addNoise(imperfectImage, opts.noiseOpacity)
  if (opts.addColor) {
    logger.debug(`Adding color overlay with opacity ${opts.addColorOpacity}`)
    imperfectImage = await addHintOfColor(imperfectImage, opts.addColor.value, {
      opacity: opts.addColorOpacity,
    })
  }

  logger.debug(`Rendered image with resolution ${posterMeta.width}x${posterMeta.height}`)

  const resizedImage = await _resize(imperfectImage, opts)
  const metadata = await getImageMetadata(resizedImage)

  return {
    imageData: await sharp(resizedImage)
      .toFormat(opts.format, getFormatOptions(opts.format))
      .toBuffer(),
    metadata,
    mimeType: formatToMimeType(opts.format),
  }
}

async function render(imageId, imageToPlace, _opts) {
  const opts = _.merge({
    highQuality: false,
    format: 'jpg',
  }, _opts)

  const { rendered, imageInfo } = await _render(imageId, imageToPlace, opts)
  const imageMetadata = await getImageMetadata(rendered)
  logger.debug(`Rendered image with resolution ${imageMetadata.width}x${imageMetadata.height}`)

  let cropped = rendered
  if (imageInfo.instructions.crop) {
    const cropOpts = {
      left: imageInfo.instructions.crop.topLeft.x,
      top: imageInfo.instructions.crop.topLeft.y,
      width: imageInfo.instructions.crop.width,
      height: imageInfo.instructions.crop.height,
    }
    logger.debug(`Cropping image ${imageId}`, cropOpts)

    cropped = await sharp(rendered)
      .extract(cropOpts)
      .png()
      .toBuffer()
  }

  const resizedImage = await _resize(cropped, opts)
  const metadata = await getImageMetadata(resizedImage)

  return {
    imageData: await sharp(resizedImage)
      .toFormat(opts.format, getFormatOptions(opts.format))
      .toBuffer(),
    metadata,
    mimeType: formatToMimeType(opts.format),
  }
}

async function getMetadata(imageId, opts = {}) {
  const imageInfo = await assetCore.getAsset(imageId, {
    minWidth: opts.resizeToWidth,
    minHeight: opts.resizeToHeight,
  })

  return imageInfo.sceneImageMetadata
}

module.exports = {
  render,
  renderImperfect,
  getMetadata,
}
