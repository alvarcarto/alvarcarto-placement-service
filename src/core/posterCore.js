const fs = require('fs')
const BPromise = require('bluebird')
const path = require('path')

function getFilePath(relativePath) {
  return path.join(__dirname, '../../', relativePath)
}

function getPoster(opts) {
  return BPromise.resolve(fs.readFileSync(getFilePath('images/poster.png')))
}

module.exports = {
  getPoster,
}
