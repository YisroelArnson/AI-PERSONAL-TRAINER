/**
 * File overview:
 * Provides shared helpers for hash.
 *
 * Main functions in this file:
 * - sha256Hex: Handles Sha256 hex for hash.js.
 * - hashRequestPayload: Hashes Request payload for stable comparison.
 */

const { createHash } = require('node:crypto');

const { stableJsonStringify } = require('./json');

/**
 * Handles Sha256 hex for hash.js.
 */
function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Hashes Request payload for stable comparison.
 */
function hashRequestPayload(payload) {
  return sha256Hex(stableJsonStringify(payload));
}

module.exports = {
  sha256Hex,
  hashRequestPayload
};
