const { getLatestDocVersionByDocType } = require('../../services/memory-docs.service');

const definition = {
  name: 'program_get',
  category: 'context',
  mutating: false,
  description: 'Load the current structured program_markdown for the user.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

async function execute({ userId }) {
  const record = await getLatestDocVersionByDocType(userId, 'PROGRAM');

  return {
    found: Boolean(record),
    docType: 'PROGRAM',
    docKey: record ? record.doc.doc_key : null,
    content: record ? record.version.content : null,
    currentVersion: record ? record.doc.current_version : 0
  };
}

module.exports = {
  definition,
  execute
};
