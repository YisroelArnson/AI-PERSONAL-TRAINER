'use strict';

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildHeaders() {
	const apiKey = process.env.OPEN_ROUTER_API_KEY;
	if (!apiKey) {
		throw new Error('Missing OPENROUTER_API_KEY in environment');
	}
	const headers = {
		'Authorization': `Bearer ${apiKey}`,
		'Content-Type': 'application/json'
	};
	// Optional identification headers for OpenRouter
	if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
	if (process.env.OPENROUTER_SITE_NAME) headers['X-Title'] = process.env.OPENROUTER_SITE_NAME;
	return headers;
}

/**
 * Calls OpenRouter Chat Completions API (OpenAI-compatible schema)
 * @param {Object} params
 * @param {Array<{role:string, content:string}>} params.messages
 * @param {string} [params.model]
 * @param {number} [params.temperature]
 * @param {number} [params.max_tokens]
 * @param {Object} [params.response_format] - e.g. { type: 'json_object' }
 * @returns {Promise<{content:string, raw:any, model:string}>}
 */
async function chatComplete({ messages, model = DEFAULT_MODEL, temperature = 0.3, max_tokens, response_format }) {
	if (!globalThis.fetch) {
		throw new Error('Global fetch is not available. Please run on Node.js v18+ or polyfill fetch.');
	}
	if (!Array.isArray(messages) || messages.length === 0) {
		throw new Error('messages must be a non-empty array');
	}

	const body = {
		model,
		messages,
		temperature
	};

	if (typeof max_tokens === 'number') body.max_tokens = max_tokens;
	if (response_format) body.response_format = response_format;

	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: buildHeaders(),
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`OpenRouter error ${res.status}: ${text}`);
	}

	const json = await res.json();
	const choice = json.choices && json.choices[0];
	const content = choice && choice.message && choice.message.content ? choice.message.content : '';
	return { content, raw: json, model };
}

module.exports = {
	chatComplete,
	DEFAULT_MODEL
};
