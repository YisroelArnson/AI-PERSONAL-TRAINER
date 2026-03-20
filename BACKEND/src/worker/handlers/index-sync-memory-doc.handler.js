const { syncMemoryDocIndex } = require('../../runtime/services/memory-doc-indexing.service');

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
