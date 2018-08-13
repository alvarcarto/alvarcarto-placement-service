const _ = require('lodash')

// All 4 parameters are needed for function signature so Express detects that it is a error
// handling middleware
// eslint-disable-next-line
const createErrorResponder = () => (err, req, res, next) => {
  const status = err.status ? err.status : 500

  const isValidationError = _.has(err, 'errors')
  if (isValidationError) {
    res.status(400)
    res.json(err)
    return
  }

  res.status(status)
  res.json({
    message: err.message,
    errors: err.errors,
  })
}

module.exports = createErrorResponder
