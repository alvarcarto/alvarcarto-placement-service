const _ = require('lodash')
const fs = require('fs')
const geolib = require('geolib')
const queryString = require('query-string')

const STEPS = process.argv[4] ? Number(process.argv[4]) : 300

function calculateSteps(startCoord, endCoord, splits = STEPS) {
  const latDiff = endCoord.lat - startCoord.lat
  const lngDiff = endCoord.lng - startCoord.lng
  return _.map(_.range(splits + 1), (i) => {
    return {
      lat: startCoord.lat + (i * (latDiff / splits)),
      lng: startCoord.lng + (i * (lngDiff / splits)),
    }
  })
}

function getCenter(sw, ne) {
  const center = geolib.getCenter([
    { latitude: ne.lat, longitude: ne.lng },
    { latitude: sw.lat, longitude: sw.lng },
  ])

  return { lat: center.latitude, lng: center.longitude }
}

function coordToPrettyText(coord) {
  const first = {
    val: Math.abs(coord.lat).toFixed(3),
    label: coord.lat > 0 ? 'N' : 'S',
  }

  const second = {
    val: Math.abs(coord.lng).toFixed(3),
    label: coord.lng > 0 ? 'E' : 'W',
  }

  return `${first.val}°${first.label} / ${second.val}°${second.label}`
}

function readJsonFile(filePath) {
  if (!filePath) {
    throw new Error(`Invalid file: ${filePath}`)
  }

  let content
  try {
    content = fs.readFileSync(filePath, { encoding: 'utf-8' })
  } catch (e) {
    console.error(`Could not open file: ${filePath}`)
    throw e
  }

  try {
    return JSON.parse(content)
  } catch (e) {
    console.error(`Could not parse JSON from file: ${filePath}`)
    throw e
  }
}

async function main() {
  if (!process.argv[2] || !process.argv[3]) {
    console.error('Usage: script.js start-designer-cart.json end-designer-cart.json')
    process.exit(1)
  }

  const start = readJsonFile(process.argv[2])[0]
  const end = readJsonFile(process.argv[3])[0]

  const southWestSteps = calculateSteps(start.mapBounds.southWest, end.mapBounds.southWest)
  const northEastSteps = calculateSteps(start.mapBounds.northEast, end.mapBounds.northEast)

  if (southWestSteps.length !== northEastSteps.length) {
    throw new Error('Steps are not the same size')
  }

  const placementId = 'flatlay-flowers-shop'
  const basicAttrs = {
    mapStyle: start.mapStyle,
    posterStyle: start.posterStyle,
    labelsEnabled: start.labelsEnabled,
    labelHeader: start.labelHeader,
    labelSmallHeader: start.labelSmallHeader,
    labelText: start.labelText,
    resizeToWidth: 1000,
  }

  console.log('#!/bin/bash')
  console.log('\nset -e')
  console.log('set -x\n\n')

  _.forEach(_.zip(southWestSteps, northEastSteps), ([swStep, neStep], index) => {
    const queryParams = _.merge({}, basicAttrs, {
      swLat: swStep.lat,
      swLng: swStep.lng,
      neLat: neStep.lat,
      neLng: neStep.lng,
      labelText: coordToPrettyText(getCenter(swStep, neStep)),
    })
    const query = queryString.stringify(queryParams)
    console.log(`curl -H"x-api-key: $API_KEY" -o ${index}.jpg 'https://tile-api.alvarcarto.com/placement/api/place-map/${placementId}?${query}'`)
  })

  console.log('ffmpeg -framerate 15 -pattern_type glob -i \'*.jpg\' -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p output.mp4')

  console.error(`\n\nGenerated ${southWestSteps.length} frames`)
}


main()
  .then(() => console.error('Done.'))
  .catch((err) => {
    throw err
  })
