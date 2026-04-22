/**
 * File overview:
 * Contains automated tests for the episodic notes service behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const {
  formatBootstrapEpisodicNotes,
  getDateKeysForReadStrategy
} = require('../../src/runtime/services/episodic-notes.service');

describe('episodic-notes.service', () => {
  it('builds today and yesterday keys in the user timezone', () => {
    const keys = getDateKeysForReadStrategy({
      now: new Date('2026-03-20T05:30:00.000Z'),
      timezone: 'America/New_York',
      readStrategy: 'today_and_yesterday'
    });

    expect(keys).toEqual(['2026-03-20', '2026-03-19']);
  });

  it('formats bootstrap episodic notes with doc labels', () => {
    const markdown = formatBootstrapEpisodicNotes([
      {
        docKey: 'EPISODIC_DATE:2026-03-20',
        content: '## Session Excerpt\n\nuser: hi'
      },
      {
        docKey: 'EPISODIC_DATE:2026-03-19',
        content: '## Session Excerpt\n\nassistant: hello'
      }
    ]);

    expect(markdown).toContain('These date-keyed episodic notes were loaded because this is the start of a new session.');
    expect(markdown).toContain('### EPISODIC_DATE:2026-03-20');
    expect(markdown).toContain('### EPISODIC_DATE:2026-03-19');
  });
});
