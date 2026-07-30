import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GalleryVersionRecord } from '../shared/gallery';
import { GALLERY_SCHEMA_VERSION } from '../shared/gallery';
import { designLibraryPathsFromHome, galleryVersionDir, galleryVersionRecordFile } from '../shared/paths';
import type { DesignLibraryPaths } from '../shared/paths';
import { readJsonFile, writeJsonFile } from '../shared/state-io';
import { tweakCssBlock, type TweakManifest } from '../shared/tweaks';
import { TEST_BRIEF } from './test-fixtures';
import {
  EXPORT_MANIFEST_FILE,
  runGalleryExport,
  type DesignLibraryExportManifest,
} from './export';

let home: string;
let downloads: string;
let workspace: string;
let paths: DesignLibraryPaths;

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-export-'));
  downloads = path.join(home, 'Downloads');
  workspace = path.join(home, 'workspace');
  paths = designLibraryPathsFromHome(path.join(home, 'app'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function seedVersion(): Promise<GalleryVersionRecord> {
  const directory = galleryVersionDir(paths, 'fam-1', 'ver-1');
  const sourceDir = path.join(directory, 'source');
  const assetDir = path.join(directory, 'assets');
  await Promise.all([mkdir(sourceDir, { recursive: true }), mkdir(assetDir, { recursive: true })]);
  const sources = [
    {
      name: 'index.html',
      bytes: Buffer.from('<!doctype html><link rel="stylesheet" href="styles.css"><main><h1>Signal</h1><img src="assets/art.image"></main>'),
    },
    {
      name: 'styles.css',
      bytes: Buffer.from(':root{--signal:#000}h1{color:var(--signal)}code{font-family:"JetBrains Mono"}'),
    },
  ];
  for (const source of sources) await writeFile(path.join(sourceDir, source.name), source.bytes);
  const artwork = Buffer.from('gallery-owned-artwork');
  await writeFile(path.join(assetDir, 'art.image'), artwork);
  const tweakManifest: TweakManifest = {
    schemaVersion: 2,
    variantRevisionId: 'rev-1',
    controls: [{
      id: 'signal', group: 'Colour', label: 'Signal', cssVariable: '--signal',
      control: { type: 'colour' as const }, defaultValue: '#000000',
    }],
  };
  const tweakOverrides = { signal: '#ff0000' };
  const effectiveCss = tweakCssBlock(tweakManifest, tweakOverrides);
  await writeFile(path.join(directory, 'effective-tweaks.css'), effectiveCss, 'utf8');
  const record: GalleryVersionRecord = {
    id: 'ver-1', schemaVersion: GALLERY_SCHEMA_VERSION, familyId: 'fam-1', createdAt: 10,
    title: 'Signal Ledger', name: 'Signal Ledger', summary: 'A precise signal page.', target: 'html',
    sourceDesignId: 'dsn-1', sourceVariantId: 'var-1', sourceRevisionId: 'rev-1', sourceJobId: 'job-1',
    files: sources.map((source) => ({
      name: source.name, bytes: source.bytes.byteLength, checksum: digest(source.bytes),
    })),
    assets: [{
      id: 'art', reference: 'assets/art.image', file: 'assets/art.image',
      mediaType: 'image/png', bytes: artwork.byteLength, checksum: digest(artwork),
      request: { capability: 'text-to-image', prompt: 'signal artwork' },
    }],
    previewFile: 'preview.png', previewBytes: 0, previewChecksum: '',
    brief: TEST_BRIEF,
    guardrails: { always: [], never: [], session: [], resolved: [] },
    references: [{ itemId: 'itm-1', order: 0, title: 'Reference' }],
    tweakManifest,
    effectiveTweaksFile: 'effective-tweaks.css',
    tweakOverrides,
    effectiveTweakValues: {
      '--signal': '#ff0000',
      '--font-family': 'Inter, system-ui, sans-serif',
    },
    dependencyManifest: [],
  };
  await writeJsonFile(galleryVersionRecordFile(paths, 'fam-1', 'ver-1'), record);
  return record;
}

describe('standalone Gallery export', () => {
  it('writes exact source, assets, fonts, resolved Tweaks and metadata to Downloads', async () => {
    const version = await seedVersion();
    const output = await runGalleryExport(paths, {
      exportId: 'exp-1', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
    }, { workspacePath: workspace, downloadsDir: downloads, now: () => 20 });

    await expect(readFile(path.join(output, 'source/index.html'), 'utf8')).resolves.toContain('Signal');
    await expect(readFile(path.join(output, 'assets/art.image'), 'utf8')).resolves.toBe('gallery-owned-artwork');
    await expect(access(path.join(output, 'fonts/inter-latin.woff2'))).resolves.toBeUndefined();
    await expect(readFile(path.join(output, 'effective-tweaks.css'), 'utf8')).resolves.toContain('--signal: #ff0000');
    const page = await readFile(path.join(output, 'index.html'), 'utf8');
    expect(page).toContain('--signal: #ff0000');
    expect(page).toContain('assets/art.image');
    expect(page).toContain('prefers-reduced-motion: reduce');
    expect(page).not.toContain('sero-design-preview');

    const manifest = await readJsonFile<DesignLibraryExportManifest>(path.join(output, EXPORT_MANIFEST_FILE));
    expect(manifest).toMatchObject({
      exportId: 'exp-1', exportedAt: 20, familyId: 'fam-1', versionId: 'ver-1',
      effectiveTweakValues: version.effectiveTweakValues,
      entry: { file: 'index.html' },
    });
    expect(manifest?.fonts[0]?.id).toBe('inter-latin');
    expect(manifest?.fonts.map((font) => font.id)).toContain('jetbrains-mono-latin');
  });

  it('uses the active workspace and replays the same export idempotently', async () => {
    await seedVersion();
    const input = {
      exportId: 'exp-2', familyId: 'fam-1', versionId: 'ver-1', destination: 'workspace' as const,
    };
    const first = await runGalleryExport(paths, input, { workspacePath: workspace });
    const second = await runGalleryExport(paths, input, { workspacePath: workspace });

    expect(first).toBe(second);
    expect(first.startsWith(path.join(workspace, 'design-library-exports'))).toBe(true);
  });

  it('refuses a Gallery source file whose bytes changed', async () => {
    await seedVersion();
    await writeFile(
      path.join(galleryVersionDir(paths, 'fam-1', 'ver-1'), 'source/index.html'),
      'tampered',
      'utf8',
    );

    await expect(runGalleryExport(paths, {
      exportId: 'exp-3', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
    }, { workspacePath: workspace, downloadsDir: downloads })).rejects.toThrow('integrity check');
  });

  it('refuses a workspace export folder that is a symlink outside the workspace', async () => {
    await seedVersion();
    const outside = path.join(home, 'outside');
    await Promise.all([mkdir(workspace, { recursive: true }), mkdir(outside, { recursive: true })]);
    await symlink(outside, path.join(workspace, 'design-library-exports'));

    await expect(runGalleryExport(paths, {
      exportId: 'exp-4', familyId: 'fam-1', versionId: 'ver-1', destination: 'workspace',
    }, { workspacePath: workspace })).rejects.toThrow('outside the active workspace');
  });
});
