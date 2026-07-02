import { describe, expect, it } from 'vitest';
import { buildCatalogInstall, OFFICIAL_CATALOG_KEY } from '../../shared/catalog';
import type { CatalogEntry, CatalogEntryMeta } from '../../shared/catalog-types';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY } from '../../shared/defaults';
import type { SharedLoopDefinition } from '../../shared/types';
import { handleCatalogAction } from '../catalog-actions';
import { handleLibraryAction } from '../library-actions';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, planJson } from './fixtures';

const NO_TRIGGERS_REPLY = JSON.stringify({ recurring: false, events: [] });

function definition(overrides: Partial<SharedLoopDefinition> = {}): SharedLoopDefinition {
  return {
    schemaVersion: 1,
    prompt: 'Write a short daily note into your project',
    title: 'Daily note',
    summary: 'Writes a daily note.',
    plan: oneStepPlan().plan,
    triggers: [{ type: 'manual' }],
    limits: { ...DEFAULT_LIMITS },
    logPolicy: { ...DEFAULT_LOG_POLICY },
    ...overrides,
  };
}

function entry(meta: Partial<CatalogEntryMeta> = {}, def = definition()): CatalogEntry {
  return {
    repoKey: OFFICIAL_CATALOG_KEY,
    meta: { slug: 'daily-note', name: 'Daily note', description: 'Writes a daily note.', version: 1, ...meta },
    definition: def,
  };
}

function seedCatalog(host: FakeHost, catalogEntry: CatalogEntry): void {
  host.catalogContents.set(catalogEntry.repoKey, {
    repo: { key: catalogEntry.repoKey, url: 'https://example.com/catalog.git', official: catalogEntry.repoKey === OFFICIAL_CATALOG_KEY },
    index: { version: 1, name: 'Test catalog', entries: [catalogEntry.meta.slug] },
    entries: [catalogEntry],
    problems: [],
  });
}

/** Scripts one successful adaptation plan pass (planner reply + trigger extraction). */
function scriptPlanning(host: FakeHost): void {
  host.modelResponses.push({ response: planJson(oneStepPlan()) });
  host.modelResponses.push({ response: NO_TRIGGERS_REPLY });
}

async function install(host: FakeHost, slug = 'daily-note', repoKey = OFFICIAL_CATALOG_KEY, workspaceLoad?: boolean) {
  return handleCatalogAction(host, { kind: 'catalog_install', repoKey, slug, workspaceLoad });
}

describe('catalog_install', () => {
  it('lands a provenance-linked library version and an adapted draft — never active', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());
    scriptPlanning(host);

    const res = await install(host);

    expect(res.ok).toBe(true);
    expect(res.loop?.status).toBe('draft');
    expect(res.loop?.libraryLink).toMatchObject({ version: 1 });

    const index = await host.library.readIndex();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0].catalog).toEqual({
      repoKey: OFFICIAL_CATALOG_KEY,
      slug: 'daily-note',
      catalogVersion: 1,
      libraryVersion: 1,
    });
    const version = await host.library.readVersion(index.entries[0].id, 1);
    expect(version?.catalog).toEqual({ repoKey: OFFICIAL_CATALOG_KEY, slug: 'daily-note', catalogVersion: 1 });

    // The planner adapted, not reinvented: the curated definition rode along.
    expect(host.modelCalls[0].task).toContain('ADAPTING AN INSTALLED CATALOG LOOP');
    expect(host.modelCalls[0].task).toContain('Write a short daily note');
    // The draft landed in state and nothing activated it.
    const state = await host.readState();
    expect(state?.loops.map((l) => l.status)).toEqual(['draft']);
  });

  it('reinstalling the same catalog version is a no-op pointing at the existing library version', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());
    scriptPlanning(host);
    await install(host);
    scriptPlanning(host);

    const res = await install(host);

    expect(res.ok).toBe(true);
    expect(res.loop?.libraryLink).toMatchObject({ version: 1 });
    const index = await host.library.readIndex();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0].latestVersion).toBe(1); // nothing appended
  });

  it('a newer catalog version appends the next library version with provenance', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());
    scriptPlanning(host);
    await install(host);

    seedCatalog(host, entry({ version: 2, description: 'Now with weather.' }));
    scriptPlanning(host);
    const res = await install(host);

    expect(res.loop?.libraryLink).toMatchObject({ version: 2 });
    const index = await host.library.readIndex();
    expect(index.entries[0]).toMatchObject({ latestVersion: 2, summary: 'Now with weather.' });
    expect(index.entries[0].catalog).toMatchObject({ catalogVersion: 2, libraryVersion: 2 });
  });

  it('interleaved manual saves keep numbering monotonic and reinstall resolution intact', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());
    scriptPlanning(host);
    const first = await install(host);

    // A manual save on the installed loop bumps the same entry to v2.
    const saved = await handleLibraryAction(host, { kind: 'library_save', loopId: first.loop!.id, mode: 'new-version' });
    expect(saved.loop?.libraryLink?.version).toBe(2);

    // Catalog v2 then lands as library v3; the entry marker tracks it.
    seedCatalog(host, entry({ version: 2 }));
    scriptPlanning(host);
    const res = await install(host);
    expect(res.loop?.libraryLink).toMatchObject({ version: 3 });
    const index = await host.library.readIndex();
    expect(index.entries[0].catalog).toMatchObject({ catalogVersion: 2, libraryVersion: 3 });
    expect((await host.library.readVersion(index.entries[0].id, 2))?.catalog).toBeUndefined(); // the manual save
  });

  it('an invalid definition blocks with errors and writes nothing', async () => {
    const host = createFakeHost();
    const broken = definition({ plan: { ...oneStepPlan().plan, steps: [] } });
    seedCatalog(host, entry({}, broken));

    const res = await install(host);

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid/);
    expect(await host.library.readIndex()).toMatchObject({ entries: [] });
    expect((await host.readState())?.loops).toEqual([]);
    expect(host.modelCalls).toHaveLength(0); // no adaptation attempted
  });

  it('missing required tools warn fail-soft and the warning rides the draft', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry({ requiredTools: ['mcp'] }));
    scriptPlanning(host);

    const res = await install(host);

    expect(res.ok).toBe(true);
    const warning = res.loop?.warnings.find((w) => w.code === 'catalog-tool-missing');
    expect(warning?.message).toContain('"mcp"');
  });

  it('present required tools produce no warning', async () => {
    const host = createFakeHost();
    host.toolCatalog = [{ name: 'mcp', description: 'proxy' }];
    seedCatalog(host, entry({ requiredTools: ['mcp'] }));
    scriptPlanning(host);

    const res = await install(host);
    expect(res.loop?.warnings.some((w) => w.code === 'catalog-tool-missing')).toBe(false);
  });

  it('parks planner clarifying questions on the installed draft', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());
    host.modelResponses.push({
      response: JSON.stringify({ clarifyingQuestions: [{ prompt: 'Which folder should the note go in?' }] }),
    });

    const res = await install(host);

    expect(res.ok).toBe(true);
    expect(res.loop?.runtime.pendingInput?.questions[0].prompt).toMatch(/Which folder/);
    expect(res.loop?.libraryLink).toMatchObject({ version: 1 }); // library write already landed
  });

  it('workspaceLoad: false installs into the library only', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());

    const res = await install(host, 'daily-note', OFFICIAL_CATALOG_KEY, false);

    expect(res.ok).toBe(true);
    expect(res.loop).toBeUndefined();
    expect((await host.library.readIndex()).entries).toHaveLength(1);
    expect((await host.readState())?.loops).toEqual([]);
    expect(host.modelCalls).toHaveLength(0);
  });

  it('errors clearly for an unknown entry', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());
    const res = await install(host, 'nope');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/);
  });
});

describe('catalog repo actions', () => {
  it('catalog_list returns repos and cached contents', async () => {
    const host = createFakeHost();
    seedCatalog(host, entry());
    const res = await handleCatalogAction(host, { kind: 'catalog_list' });
    expect(res.ok).toBe(true);
    expect(res.catalogRepos?.[0]).toMatchObject({ key: OFFICIAL_CATALOG_KEY, official: true });
    expect(res.catalogContents?.[0].entries).toHaveLength(1);
  });

  it('catalog_add_repo returns the updated repo list; removing the official repo is an error result', async () => {
    const host = createFakeHost();
    const added = await handleCatalogAction(host, { kind: 'catalog_add_repo', url: 'https://example.com/team.git' });
    expect(added.ok).toBe(true);
    expect(added.catalogRepos).toHaveLength(2);

    const removed = await handleCatalogAction(host, { kind: 'catalog_remove_repo', repoKey: OFFICIAL_CATALOG_KEY });
    expect(removed.ok).toBe(false);
    expect(removed.error).toMatch(/cannot be removed/);
  });

  it('catalog_refresh reports an unknown repoKey as an error', async () => {
    const host = createFakeHost();
    const res = await handleCatalogAction(host, { kind: 'catalog_refresh', repoKey: 'nope' });
    expect(res.ok).toBe(false);
  });
});

describe('buildCatalogInstall', () => {
  const now = '2026-07-02T00:00:00.000Z';

  it('starts a fresh entry at v1 with the install marker', () => {
    const plan = buildCatalogInstall({ catalogEntry: entry(), existing: null, newEntryId: 'lib-1', now });
    expect(plan.write?.entry).toMatchObject({ id: 'lib-1', name: 'Daily note', latestVersion: 1 });
    expect(plan.write?.version.catalog).toEqual({ repoKey: OFFICIAL_CATALOG_KEY, slug: 'daily-note', catalogVersion: 1 });
    expect(plan.libraryVersion).toBe(1);
  });

  it('reinstall (same or older catalog version) is a no-op', () => {
    const existing = {
      id: 'lib-1',
      name: 'Daily note (renamed)',
      summary: 's',
      latestVersion: 4,
      catalog: { repoKey: OFFICIAL_CATALOG_KEY, slug: 'daily-note', catalogVersion: 2, libraryVersion: 3 },
      createdAt: now,
      updatedAt: now,
    };
    expect(buildCatalogInstall({ catalogEntry: entry({ version: 2 }), existing, newEntryId: 'x', now })).toEqual({
      entryId: 'lib-1',
      libraryVersion: 3,
    });
    expect(buildCatalogInstall({ catalogEntry: entry({ version: 1 }), existing, newEntryId: 'x', now }).write).toBeUndefined();
  });

  it('a newer catalog version appends after the entry latest and preserves the user rename', () => {
    const existing = {
      id: 'lib-1',
      name: 'My renamed loop',
      summary: 's',
      latestVersion: 4,
      catalog: { repoKey: OFFICIAL_CATALOG_KEY, slug: 'daily-note', catalogVersion: 2, libraryVersion: 3 },
      createdAt: now,
      updatedAt: now,
    };
    const plan = buildCatalogInstall({ catalogEntry: entry({ version: 3 }), existing, newEntryId: 'x', now });
    expect(plan.libraryVersion).toBe(5);
    expect(plan.write?.entry).toMatchObject({ id: 'lib-1', name: 'My renamed loop', latestVersion: 5 });
    expect(plan.write?.entry.catalog).toMatchObject({ catalogVersion: 3, libraryVersion: 5 });
  });
});
