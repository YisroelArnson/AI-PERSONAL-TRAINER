/**
 * File overview:
 * Contains automated tests for the chunking and session indexing service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const {
  chunkMarkdownDeterministically,
  chunkSessionEntriesDeterministically
} = require('../../src/runtime/services/chunking.service');
const {
  toIndexableSessionEntries
} = require('../../src/runtime/services/session-indexing.service');

describe('chunking and session indexing helpers', () => {
  it('chunks markdown deterministically with offsets', () => {
    const markdown = [
      '# Header',
      '',
      'First paragraph with some context. '.repeat(8).trim(),
      '',
      'Second paragraph with more detail. '.repeat(8).trim(),
      '',
      'Third paragraph that forces another chunk. '.repeat(8).trim()
    ].join('\n');

    const chunks = chunkMarkdownDeterministically(markdown, {
      maxChars: 220,
      overlapChars: 40
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].endOffset).toBeGreaterThan(chunks[0].startOffset);
    expect(chunks[0].content.length).toBeGreaterThan(0);
  });

  it('groups session entries into deterministic seq-ranged chunks', () => {
    const chunks = chunkSessionEntriesDeterministically([
      {
        seqNum: 1,
        actor: 'user',
        text: 'Can you help? '.repeat(10).trim()
      },
      {
        seqNum: 2,
        actor: 'assistant',
        text: 'Yes. '.repeat(10).trim()
      },
      {
        seqNum: 3,
        actor: 'user',
        text: 'Here is a much longer message that should force a split. '.repeat(12).trim()
      }
    ], {
      maxChars: 220
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toEqual(expect.objectContaining({
      startSeqNum: 1
    }));
    expect(chunks[0].content).toContain('[0001] user: Can you help?');
  });

  it('extracts only visible user and assistant messages for indexing', () => {
    const entries = toIndexableSessionEntries([
      {
        seq_num: 1,
        actor: 'user',
        payload: {
          message: 'help me with my squat form'
        }
      },
      {
        seq_num: 2,
        actor: 'user',
        payload: {
          message: '/new'
        }
      },
      {
        seq_num: 3,
        actor: 'assistant',
        payload: {
          text: 'Keep your chest up.'
        }
      },
      {
        seq_num: 4,
        actor: 'tool',
        payload: {
          text: 'program updated'
        }
      }
    ]);

    expect(entries).toEqual([
      {
        seqNum: 1,
        actor: 'user',
        text: 'help me with my squat form'
      },
      {
        seqNum: 3,
        actor: 'assistant',
        text: 'Keep your chest up.'
      }
    ]);
  });
});
