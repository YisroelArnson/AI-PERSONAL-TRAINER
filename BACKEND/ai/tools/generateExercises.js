'use strict';

const { chatComplete } = require('../llmClient');
const { buildUserDataPrompt } = require('./promptBuilder');

function coerceToValidJSON(text) {
	// Attempt to extract a JSON object from the text
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start !== -1 && end !== -1 && end > start) {
		const candidate = text.slice(start, end + 1);
		try {
			return JSON.parse(candidate);
		} catch (e) {
			// fallthrough
		}
	}
	throw new Error('Model did not return valid JSON');
}

/**
 * Generate exercises JSON via OpenRouter using the dynamic prompt
 * @param {Object} userData - Output of fetchAllUserData
 * @param {Object} [options]
 * @param {string} [options.model] - Override model id
 * @param {number} [options.temperature]
 * @param {number} [options.exerciseCount=8] - Number of exercises to generate (1-20)
 * @returns {Promise<{exercises: Array}>}
 */
async function generateExercises(userData, options = {}) {
	const prompt = buildUserDataPrompt(userData, options.exerciseCount || 8);

	const messages = [
		{ role: 'system', content: 'You are a JSON generator. Output ONLY valid JSON. No explanations, no thinking out loud, no prose. Just the JSON object.' },
		{ role: 'user', content: prompt }
	];

	const { content } = await chatComplete({
		messages,
		model: options.model,
		temperature: options.temperature ?? 0.2,
		response_format: { type: 'json_object' }
	});

	console.log(content);
	const json = coerceToValidJSON(content || '');
	if (!json || !Array.isArray(json.exercises)) {
		throw new Error('Invalid response: missing exercises array');
	}
	return json;
}

module.exports = { generateExercises };
