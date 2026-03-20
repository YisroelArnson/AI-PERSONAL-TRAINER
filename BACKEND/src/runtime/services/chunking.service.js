function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function chunkMarkdownDeterministically(markdown, options = {}) {
  const normalized = normalizeText(markdown);
  const maxChars = Math.max(200, Number(options.maxChars) || 1200);
  const overlapChars = Math.max(0, Math.min(maxChars - 50, Number(options.overlapChars) || 200));
  const chunks = [];

  if (!normalized.trim()) {
    return chunks;
  }

  let startOffset = 0;

  while (startOffset < normalized.length) {
    let endOffset = Math.min(normalized.length, startOffset + maxChars);

    if (endOffset < normalized.length) {
      const paragraphBreakIndex = normalized.lastIndexOf('\n\n', endOffset);
      const lineBreakIndex = normalized.lastIndexOf('\n', endOffset);
      const preferredBreak = paragraphBreakIndex > startOffset + Math.floor(maxChars * 0.5)
        ? paragraphBreakIndex + 2
        : lineBreakIndex > startOffset + Math.floor(maxChars * 0.65)
          ? lineBreakIndex + 1
          : endOffset;

      endOffset = preferredBreak;
    }

    const content = normalized.slice(startOffset, endOffset).trim();

    if (content) {
      chunks.push({
        startOffset,
        endOffset,
        content
      });
    }

    if (endOffset >= normalized.length) {
      break;
    }

    startOffset = Math.max(endOffset - overlapChars, startOffset + 1);
  }

  return chunks;
}

function chunkSessionEntriesDeterministically(entries, options = {}) {
  const maxChars = Math.max(200, Number(options.maxChars) || 1200);
  const chunks = [];
  let currentEntries = [];
  let currentLength = 0;

  function pushCurrentChunk() {
    if (currentEntries.length === 0) {
      return;
    }

    chunks.push({
      startSeqNum: currentEntries[0].seqNum,
      endSeqNum: currentEntries[currentEntries.length - 1].seqNum,
      content: currentEntries
        .map(entry => `[${String(entry.seqNum).padStart(4, '0')}] ${entry.actor}: ${entry.text}`)
        .join('\n')
    });

    currentEntries = [];
    currentLength = 0;
  }

  for (const entry of entries || []) {
    const line = `[${String(entry.seqNum).padStart(4, '0')}] ${entry.actor}: ${entry.text}`;
    const nextLength = currentLength === 0 ? line.length : currentLength + 1 + line.length;

    if (currentEntries.length > 0 && nextLength > maxChars) {
      pushCurrentChunk();
    }

    currentEntries.push(entry);
    currentLength = currentLength === 0 ? line.length : currentLength + 1 + line.length;
  }

  pushCurrentChunk();

  return chunks;
}

module.exports = {
  chunkMarkdownDeterministically,
  chunkSessionEntriesDeterministically,
  normalizeText
};
