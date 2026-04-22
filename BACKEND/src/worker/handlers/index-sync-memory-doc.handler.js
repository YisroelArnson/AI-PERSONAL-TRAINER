/**
 * File overview:
 * Handles queued worker jobs for index sync memory doc.
 *
 * Main functions in this file:
 * - handleIndexSyncMemoryDoc: Handles Index sync memory doc for this module.
 */

const { syncMemoryDocIndex } = require('../../runtime/services/memory-doc-indexing.service');

/**
 * Handles Index sync memory doc for this module.
 */
async function handleIndexSyncMemoryDoc(job) {
  const {
    userId,
    docId
  } = job.data;

  const result = await syncMemoryDocIndex({
    userId,
    docId
  });

  return {
    docId,
    status: result.status
  };
}

module.exports = {
  handleIndexSyncMemoryDoc
};
