/**
 * Official-catalog content harness (spec 14 phase 5): runs every entry of a
 * LOCAL catalog checkout through the exact validation an install performs, so
 * shipped content can never rot silently. Gated — run before every content
 * push:
 *
 *   SERO_CATALOG_DIR=/path/to/orchestrator-catalog npx vitest run runtime/__tests__/catalog-content.test.ts
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogEntryMetaProblems, isCatalogIndex } from '../../shared/catalog';
import type { CatalogEntryMeta, CatalogIndex } from '../../shared/catalog-types';
import type { SharedLoopDefinition } from '../../shared/types';
import { validateSharedDefinition } from '../definition-validation';

const CATALOG_DIR = process.env.SERO_CATALOG_DIR;

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

// skipIf still EXECUTES this callback at collection time, so all file reads
// must stay behind the gate themselves.
describe.skipIf(!CATALOG_DIR)('official catalog content', () => {
  const root = CATALOG_DIR ?? '';
  const index = CATALOG_DIR ? readJson(path.join(root, 'catalog.json')) : null;

  it('has a valid index that matches the loops/ directory exactly', () => {
    expect(isCatalogIndex(index)).toBe(true);
    const dirs = readdirSync(path.join(root, 'loops'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect([...(index as CatalogIndex).entries].sort()).toEqual(dirs);
  });

  for (const slug of (isCatalogIndex(index) ? index.entries : []) as string[]) {
    describe(slug, () => {
      const dir = path.join(root, 'loops', slug);

      it('metadata is valid and matches its directory', () => {
        const meta = readJson(path.join(dir, 'catalog.json'));
        expect(catalogEntryMetaProblems(meta)).toEqual([]);
        expect((meta as CatalogEntryMeta).slug).toBe(slug);
      });

      it('definition passes the real install validation', () => {
        const definition = readJson(path.join(dir, 'definition.json')) as SharedLoopDefinition;
        expect(definition.schemaVersion).toBe(1);
        expect(definition.prompt.trim()).toBeTruthy();
        expect(validateSharedDefinition(definition)).toEqual([]);
        // Product-authored definitions carry real triggers, never lifetime caps
        // masquerading as per-run bounds.
        expect(definition.triggers.length).toBeGreaterThan(0);
        for (const trigger of definition.triggers) expect(trigger.maxFires).toBeUndefined();
      });

      it('declared delivery matches the display metadata', () => {
        const meta = readJson(path.join(dir, 'catalog.json')) as CatalogEntryMeta;
        const definition = readJson(path.join(dir, 'definition.json')) as SharedLoopDefinition;
        if (meta.delivery && definition.delivery) expect(definition.delivery.destination).toBe(meta.delivery);
      });
    });
  }
});
