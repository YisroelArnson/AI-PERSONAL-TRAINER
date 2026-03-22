const { getCoachSoulDocument, COACH_SOUL_DOC_KEY } = require('../../services/memory-docs.service');

const definition = {
  name: 'coach_soul_get',
  category: 'context',
  mutating: false,
  description: 'Load the current durable coach soul Markdown that defines the trainer identity, tone, and relational stance.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

async function execute({ userId }) {
  const record = await getCoachSoulDocument(userId);

  return {
    found: Boolean(record),
    docType: COACH_SOUL_DOC_KEY,
    docKey: COACH_SOUL_DOC_KEY,
    content: record ? record.version.content : null,
    currentVersion: record ? record.doc.current_version : 0
  };
}

module.exports = {
  definition,
  execute
};
