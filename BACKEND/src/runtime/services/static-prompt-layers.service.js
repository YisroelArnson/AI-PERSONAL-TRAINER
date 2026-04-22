/**
 * File overview:
 * Implements runtime service logic for static prompt layers.
 *
 * Main functions in this file:
 * - normalizeMarkdown: Normalizes Markdown into the format this file expects.
 * - getPromptLayerPath: Gets Prompt layer path needed by this file.
 * - loadStaticPromptLayer: Loads Static prompt layer for the surrounding workflow.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const PROMPT_LAYER_DIRECTORY = path.join(__dirname, '..', 'prompt-layers');

/**
 * Normalizes Markdown into the format this file expects.
 */
function normalizeMarkdown(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

/**
 * Gets Prompt layer path needed by this file.
 */
function getPromptLayerPath(fileName) {
  return path.join(PROMPT_LAYER_DIRECTORY, fileName);
}

/**
 * Loads Static prompt layer for the surrounding workflow.
 */
async function loadStaticPromptLayer(fileName, fallback = '') {
  try {
    const markdown = await fs.readFile(getPromptLayerPath(fileName), 'utf8');
    const normalized = normalizeMarkdown(markdown);

    return normalized || normalizeMarkdown(fallback);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn(`Unable to read prompt layer ${fileName}:`, error.message);
    }

    return normalizeMarkdown(fallback);
  }
}

module.exports = {
  getPromptLayerPath,
  loadStaticPromptLayer,
  normalizeMarkdown
};
