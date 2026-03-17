const { createHash } = require('node:crypto');

const { stableJsonStringify } = require('./json');

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashRequestPayload(payload) {
  return sha256Hex(stableJsonStringify(payload));
}

module.exports = {
  sha256Hex,
  hashRequestPayload
};
