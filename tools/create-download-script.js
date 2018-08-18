const _ = require('lodash')
const combinatorics = require('js-combinatorics')
const queryString = require('query-string')
const request = require('request-promise')

function getPlacementImageIds() {
  return request({
    url: 'https://tile-api.alvarcarto.com/placement/api/images',
    json: true,
  })
    .then(items => _.map(items, item => item.id))
}

const locationAttrs = {
  egypt: {
    swLat: 25.353,
    swLng: 29.688,
    neLat: 28.236,
    neLng: 31.995,
    labelsEnabled: true,
    labelHeader: 'Egypt',
    labelSmallHeader: 'Africa',
    labelText: '0.000°N / 0.000°E',
  },
  moscow: {
    swLat: 55.692,
    swLng: 37.567,
    neLat: 55.793,
    neLng: 37.628,
    labelsEnabled: true,
    labelHeader: 'Moscow',
    labelSmallHeader: 'Russia',
    labelText: '0.000°N / 0.000°E',
  },
}

async function main() {
  const locations = ['egypt', 'moscow']
  const posterStyles = ['sharp']
  const sizes = ['FULL_RESOLUTION', 'MEDIUM_RESOLUTION']
  const mapStyles = ['bw', 'gray', 'black', 'petrol', 'copper']
  const placementIds = await getPlacementImageIds()

  const cp = combinatorics.cartesianProduct(locations, posterStyles, sizes, mapStyles, placementIds)


  const placements = _.map(cp.toArray(), ([location, posterStyle, size, mapStyle, placementId]) => {
    const queryParams = _.extend({}, locationAttrs[location], {
      posterStyle,
      mapStyle,
      format: 'jpg',
      download: true,
      placementId,
    })

    if (size === 'MEDIUM_RESOLUTION') {
      queryParams.resizeToWidth = 1200
    }
    return queryParams
  })

  console.log('#!/bin/bash')
  console.log('\nset -e')
  console.log('set -x\n\n')

  _.forEach(placements, (p) => {
    const query = queryString.stringify(_.omit(p, ['placementId']))
    const sizeLabel = p.resizeToWidth ? p.resizeToWidth : 'original'
    const name = `${p.placementId}-${p.labelHeader.toLowerCase()}-${p.posterStyle}-${p.mapStyle}-${sizeLabel}.jpg`
    console.log(`curl -H"x-api-key: $API_KEY" -o ${name} 'https://tile-api.alvarcarto.com/placement/api/place-map/${p.placementId}?${query}'`)
  })

  console.error(`\n\nGenerated ${placements.length} different combinations`)
}


main()
  .then(() => console.error('Done.'))
  .catch((err) => {
    throw err
  })
