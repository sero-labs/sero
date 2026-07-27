import { describe, expect, it } from 'vitest';

import type { DesignRevision, DesignVariant } from './design';
import { orderedRevisions, visibleRevision } from './design';

/**
 * What a variant's history is allowed to hide, which is nothing (spec §6.4).
 *
 * Replacing a result marks the one it stood in for; it does not remove it. The
 * mark is the whole difference between `replace` and `retain`, and it is only a
 * safe difference if the marked revision is still something the user can find
 * and go back to.
 */

function revision(id: string, createdAt: number, supersededAt?: number): DesignRevision {
  return {
    id,
    createdAt,
    jobId: 'job-1',
    files: [{ name: 'index.html', bytes: 12 }],
    builtFile: 'index.html',
    buildWarnings: [],
    summary: '',
    name: id,
    ...(supersededAt === undefined ? {} : { supersededAt }),
  };
}

function variant(revisions: DesignRevision[], visibleRevisionId: string): DesignVariant {
  return { id: 'var-1', index: 0, status: 'ready', attempts: 1, revisions, visibleRevisionId };
}

describe('the revisions a variant lists', () => {
  it('keeps a revision a replace stood in for', () => {
    const replaced = revision('rev-1', 1_000, 2_000);
    const current = revision('rev-2', 2_000);

    expect(orderedRevisions(variant([replaced, current], 'rev-2')).map((entry) => entry.id)).toEqual(
      ['rev-2', 'rev-1'],
    );
  });

  it('keeps every replaced revision, not only the most recent one', () => {
    const first = revision('rev-1', 1_000, 2_000);
    const second = revision('rev-2', 2_000, 3_000);
    const third = revision('rev-3', 3_000);

    expect(
      orderedRevisions(variant([first, second, third], 'rev-3')).map((entry) => entry.id),
    ).toEqual(['rev-3', 'rev-2', 'rev-1']);
  });

  it('puts the newest first whatever order they are stored in', () => {
    const older = revision('rev-1', 1_000);
    const newer = revision('rev-2', 5_000);

    expect(orderedRevisions(variant([newer, older], 'rev-1')).map((entry) => entry.id)).toEqual([
      'rev-2',
      'rev-1',
    ]);
  });
});

describe('the revision on screen', () => {
  it('is the one the pointer names, superseded or not', () => {
    const replaced = revision('rev-1', 1_000, 2_000);
    const current = revision('rev-2', 2_000);

    expect(visibleRevision(variant([replaced, current], 'rev-1'))?.id).toBe('rev-1');
  });

  it('falls back to the newest when the pointer names nothing', () => {
    const first = revision('rev-1', 1_000);
    const second = revision('rev-2', 2_000);

    expect(visibleRevision(variant([first, second], 'rev-gone'))?.id).toBe('rev-2');
  });
});
