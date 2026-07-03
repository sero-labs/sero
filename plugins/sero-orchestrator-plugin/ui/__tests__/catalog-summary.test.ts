import { describe, expect, it } from 'vitest';
import type { CatalogEntryMeta } from '../../shared/catalog-types';
import type { LibraryIndex, Loop } from '../../shared/types';
import { entryChips, installState, readaptPrompt } from '../lib/catalog-summary';

const meta = (overrides: Partial<CatalogEntryMeta> = {}): CatalogEntryMeta => ({
  slug: 'ci-fixer',
  name: 'CI fixer',
  description: 'fixes ci',
  version: 2,
  ...overrides,
});

function index(catalog?: { repoKey: string; slug: string; catalogVersion: number; libraryVersion: number }): LibraryIndex {
  return {
    version: 1,
    entries: [
      { id: 'lib-1', name: 'CI fixer', summary: 's', latestVersion: 3, versionCount: 3, catalog, updatedAt: 't' },
    ],
  };
}

describe('entryChips', () => {
  it('renders trigger, delivery, cost, tier, and connectors in order', () => {
    const chips = entryChips(
      meta({
        recommendedTrigger: 'fires on github:ci-failed',
        delivery: 'pr',
        costBand: 'medium',
        modelTier: 'MED',
        connectors: ['GitHub (gh login)'],
      }),
    ).map((c) => c.label);
    expect(chips).toEqual(['fires on github:ci-failed', '→ Pull request', 'medium cost', 'MED', 'GitHub (gh login)']);
  });

  it('is empty for bare metadata', () => {
    expect(entryChips(meta())).toEqual([]);
  });
});

describe('installState', () => {
  it('not installed when no entry carries the provenance marker', () => {
    expect(installState('official', meta(), index())).toEqual({ state: 'not-installed' });
    expect(installState('official', meta(), index({ repoKey: 'other', slug: 'ci-fixer', catalogVersion: 2, libraryVersion: 1 }))).toEqual({
      state: 'not-installed',
    });
  });

  it('installed when the marker covers this catalog version', () => {
    expect(installState('official', meta(), index({ repoKey: 'official', slug: 'ci-fixer', catalogVersion: 2, libraryVersion: 3 }))).toEqual({
      state: 'installed',
      entryId: 'lib-1',
      entryName: 'CI fixer',
    });
  });

  it('update available when the catalog moved past the installed version', () => {
    expect(
      installState('official', meta({ version: 3 }), index({ repoKey: 'official', slug: 'ci-fixer', catalogVersion: 2, libraryVersion: 3 })),
    ).toEqual({ state: 'update-available', entryId: 'lib-1', entryName: 'CI fixer', installedCatalogVersion: 2 });
  });
});

describe('readaptPrompt', () => {
  it('carries the original install answers so the refine has the concrete values', () => {
    const loop = {
      answeredInputs: [
        {
          source: 'planner',
          questions: [{ id: 'q1', prompt: 'Which repo should I watch?', choices: [{ id: 'a', label: 'acme/api' }] }],
          answers: [{ questionId: 'q1', choiceId: 'a', text: 'the main one' }],
        },
        {
          source: 'step',
          questions: [{ id: 'q2', prompt: 'step question' }],
          answers: [{ questionId: 'q2', text: 'ignored' }],
        },
      ],
    } as unknown as Loop;
    const prompt = readaptPrompt(loop);
    expect(prompt).toContain('Re-adapt the plan to this workspace');
    expect(prompt).toContain('Which repo should I watch?: acme/api — the main one');
    expect(prompt).not.toContain('step question');
  });

  it('still reads sensibly with no recorded answers', () => {
    const prompt = readaptPrompt({ answeredInputs: [] } as unknown as Loop);
    expect(prompt).toContain('generic placeholders');
    expect(prompt).not.toContain('The user answered');
  });
});
