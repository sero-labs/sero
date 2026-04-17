import { describe, expect, it } from 'vitest';

import { buildTurnUndoLabel } from '@electron/features/apps/extensions/turn-undo-labels';

describe('buildTurnUndoLabel', () => {
  it('prefers a single targeted file summary when tool metadata is available', () => {
    expect(buildTurnUndoLabel({
      targetedPaths: ['joke.txt'],
      changedPaths: ['joke.txt'],
      promptText: 'save that to file joke.txt',
    })).toBe('Update joke.txt');
  });

  it('falls back to a changed-file count when multiple files changed', () => {
    expect(buildTurnUndoLabel({
      changedPaths: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      promptText: 'refactor those files',
    })).toBe('Update 3 files');
  });

  it('uses the user prompt summary when no file metadata was captured', () => {
    expect(buildTurnUndoLabel({
      promptText: 'save that to file joke.txt',
    })).toBe('save that to file joke.txt');
  });

  it('falls back to Undo point when no prompt or mutation metadata is available', () => {
    expect(buildTurnUndoLabel({})).toBe('Undo point');
  });
});
