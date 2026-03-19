const { getLatestDocVersionByDocType } = require('../../services/memory-docs.service');

const definition = {
  name: 'memory_get',
  category: 'context',
  mutating: false,
  description: 'Load the current durable memory_markdown for the user, including preferences, injuries, equipment, and recurring context.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

async function execute({ userId }) {
  const record = await getLatestDocVersionByDocType(userId, 'MEMORY');

  return {
    found: Boolean(record),
    docType: 'MEMORY',
    docKey: record ? record.doc.doc_key : null,
    content: record ? record.version.content : null,
    currentVersion: record ? record.doc.current_version : 0
  };
}

module.exports = {
  definition,
  execute
};
