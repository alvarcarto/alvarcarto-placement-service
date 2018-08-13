const request = require('request-promise')
const config = require('../config')

function getPoster(opts) {
  return request({
    url: `${config.ALVARCARTO_RENDER_API_BASE_URL}/api/raster/render`,
    headers: {
      'x-api-key': config.ALVARCARTO_RENDER_API_KEY,
    },
    qs: opts,
    encoding: null,
  })
    .catch((err) => {
      let msg

      console.log(err)
      try {
        msg = JSON.parse(err.response.body)
      } catch (e) {
        msg = err.response.body.toString() || err.message
      }
      // eslint-disable-next-line
      err.message = msg

      throw err
    })
}

function getUrl(url) {
  return request({
    url,
    encoding: null,
  })
}

module.exports = {
  getPoster,
  getUrl,
}
