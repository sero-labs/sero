import { describe, expect, it } from 'vitest';
import type { LibraryIndex, LibraryVersion, Loop, LoopPlan } from '../../shared/types';
import { deriveLibraryLink } from '../lib/use-library-link';

const plan = (objective: string): LoopPlan => ({
  schemaVersion: 1,
  revision: 0,
  objective,
  steps: [{ id: 's', title: 'S', instructions: 'do', execution: { type: 'background-agent' } }],
});

const loop = (link: Loop['libraryLink'], objective = 'same'): Loop =>
  ({ plan: plan(objective), libraryLink: link } as Loop);

const linkedVersion = (objective: string): LibraryVersion =>
  ({ version: 1, definition: { plan: plan(objective) }, createdAt: 't' } as LibraryVersion);

const index = (latestVersion: number | null): LibraryIndex => ({
  version: 1,
  entries: latestVersion === null ? [] : [{ id: 'e1', name: 'Saved loop', summary: '', latestVersion, versionCount: latestVersion, updatedAt: 't' }],
});

const LINK = { entryId: 'e1', version: 1, syncedAt: 't' };

describe('deriveLibraryLink', () => {
  it('returns null for a standalone (unlinked) loop', () => {
    expect(deriveLibraryLink(loop(undefined), '/lib', index(1), null)).toBeNull();
  });

  it('flags an available update and lists versions newest-first', () => {
    const status = deriveLibraryLink(loop(LINK), '/lib', index(3), linkedVersion('same'));
    expect(status).toMatchObject({ updateAvailable: true, latest: 3, versions: [3, 2, 1], hasActions: true });
  });

  it('flags local divergence when the loop plan differs from its linked version', () => {
    const diverged = deriveLibraryLink(loop(LINK, 'changed'), '/lib', index(1), linkedVersion('original'));
    expect(diverged?.diverged).toBe(true);
    expect(diverged?.hasActions).toBe(true);
    // Same structure ⇒ not diverged, and with one version + on latest there's nothing to act on.
    const aligned = deriveLibraryLink(loop(LINK, 'same'), '/lib', index(1), linkedVersion('same'));
    expect(aligned?.diverged).toBe(false);
    expect(aligned?.hasActions).toBe(false);
  });

  it('flags a removed source entry only once the library dir is known', () => {
    expect(deriveLibraryLink(loop(LINK), '/lib', index(null), null)).toMatchObject({ sourceRemoved: true, hasActions: true });
    // Library dir not resolved yet ⇒ a missing entry is "unknown", not "removed".
    expect(deriveLibraryLink(loop(LINK), null, index(null), null)).toMatchObject({ sourceRemoved: false });
  });
});
