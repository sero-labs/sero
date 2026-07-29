import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  designLibraryPathsFromHome,
  designAssetDir,
  galleryFamilyRecordFile,
  galleryVersionDir,
  revisionDir,
} from '../shared/paths';
import type { DesignLibraryPaths } from '../shared/paths';
import { readState, updateState } from '../shared/state-io';
import { stageGeneratedUpload } from '../shared/uploads';
import { mutateDesign, mutateVariant, readDesign } from './design-store';
import { createDesign } from './designs';
import { readGalleryVersion } from './gallery-store';
import { saveGalleryVersion } from './gallery-snapshot';
import { duplicateGalleryVersion } from './gallery-duplicate';
import { GalleryRequests } from './gallery-requests';
import { seedItem, TEST_BRIEF } from './test-fixtures';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-gallery-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function seedDesign(): Promise<{ variantId: string; revisionId: string }> {
  await seedItem(paths, 'itm-1', { status: 'ready' });
  const created = await createDesign(paths, {
    designId: 'dsn-1',
    title: 'Signal Ledger',
    brief: { ...TEST_BRIEF, variantCount: 1 },
    referenceItemIds: ['itm-1'],
    resolutions: [],
  });
  if (created.status !== 'created') throw new Error(created.reason);
  const variantId = created.design.variants[0]!.id;
  const revisionId = 'rev-1';
  const dir = revisionDir(paths, 'dsn-1', variantId, revisionId);
  await mkdir(dir, { recursive: true });
  const source = '<main><h1>Signal</h1><img src="assets/art-1.image"></main>';
  await writeFile(path.join(dir, 'index.html'), source, 'utf8');
  await writeFile(path.join(dir, 'styles.css'), ':root{--signal:#000000}h1{color:var(--signal)}', 'utf8');
  await writeFile(path.join(dir, 'tweaks.json'), JSON.stringify({
    manifest: {
      schemaVersion: 2,
      variantRevisionId: revisionId,
      controls: [{
        id: 'signal', group: 'Colour', label: 'Signal', cssVariable: '--signal',
        control: { type: 'colour' }, defaultValue: '#000000',
      }],
    },
    dropped: [],
  }), 'utf8');
  await mutateVariant(paths, 'dsn-1', variantId, (variant) => ({
    ...variant,
    status: 'ready',
    visibleRevisionId: revisionId,
    revisions: [{
      id: revisionId,
      createdAt: 10,
      jobId: 'job-1',
      model: { providerId: 'test-provider', modelId: 'test-model' },
      files: [
        { name: 'index.html', bytes: Buffer.byteLength(source) },
        { name: 'styles.css', bytes: 20 },
      ],
      builtFile: 'preview.html',
      tweakManifestFile: 'tweaks.json',
      tweaks: { overrides: { signal: '#ff0000' }, checkpoints: [] },
      buildWarnings: [],
      summary: 'A clear signal dashboard.',
      name: 'Signal Ledger',
    }],
  }));

  const assetDir = designAssetDir(paths, 'dsn-1', 'art-1');
  await mkdir(assetDir, { recursive: true });
  await writeFile(path.join(assetDir, 'attempt.png'), Buffer.from('owned-artwork'));
  await mutateDesign(paths, 'dsn-1', (design) => ({
    ...design,
    assets: [{
      id: 'art-1',
      kind: 'image',
      reference: 'assets/art-1.image',
      request: { capability: 'text-to-image', prompt: 'signal artwork' },
      attempts: [{
        id: 'attempt-1', outcome: 'ready', startedAt: 1, completedAt: 2,
        file: 'attempt.png', mediaType: 'image/png', bytes: 13,
      }],
      createdAt: 1,
      updatedAt: 2,
    }],
  }));
  return { variantId, revisionId };
}

async function previewUpload(): Promise<string> {
  return stageGeneratedUpload(paths, Buffer.from('small-png-preview'), {
    fileName: 'gallery-preview.png',
    mediaType: 'image/png',
    kind: 'image',
    sourceKind: 'file',
    purpose: 'gallery-preview',
    previewMediaType: 'image/png',
  });
}

describe('Gallery snapshot transaction', () => {
  it('owns source files, referenced assets and a bounded preview', async () => {
    const source = await seedDesign();
    const previewUploadId = await previewUpload();
    const saved = await saveGalleryVersion(paths, {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-1', ...source, previewUploadId,
    });

    expect(saved.files.map((file) => file.name)).toEqual(['index.html', 'styles.css']);
    expect(saved.model).toEqual({ providerId: 'test-provider', modelId: 'test-model' });
    expect(saved.assets).toEqual([
      expect.objectContaining({ reference: 'assets/art-1.image', file: 'assets/art-1.image' }),
    ]);
    const versionDir = galleryVersionDir(paths, 'fam-1', 'ver-1');
    await expect(readFile(path.join(versionDir, 'source/index.html'), 'utf8')).resolves.toContain('Signal');
    await expect(readFile(path.join(versionDir, 'assets/art-1.image'), 'utf8')).resolves.toBe('owned-artwork');
    await expect(readFile(path.join(versionDir, 'preview.png'), 'utf8')).resolves.toBe('small-png-preview');
    await expect(readFile(path.join(versionDir, 'effective-tweaks.css'), 'utf8')).resolves.toContain(
      '--signal: #ff0000',
    );
    expect((await readState(paths)).galleryFamilies[0]?.featuredVersionId).toBe('ver-1');
  });

  it('stays byte-identical after the source Design is removed', async () => {
    const source = await seedDesign();
    const saved = await saveGalleryVersion(paths, {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-1', ...source,
      previewUploadId: await previewUpload(),
    });
    await rm(path.join(paths.designsDir, 'dsn-1'), { recursive: true, force: true });

    const stored = await readGalleryVersion(paths, 'fam-1', 'ver-1');
    expect(stored?.previewChecksum).toBe(saved.previewChecksum);
    await expect(
      readFile(path.join(galleryVersionDir(paths, 'fam-1', 'ver-1'), 'assets/art-1.image'), 'utf8'),
    ).resolves.toBe('owned-artwork');
  });

  it('applies a replay once without adding a second family version', async () => {
    const source = await seedDesign();
    const input = {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-1', ...source,
      previewUploadId: await previewUpload(),
    };
    await saveGalleryVersion(paths, input);
    await saveGalleryVersion(paths, input);

    expect((await readState(paths)).galleryFamilies[0]?.versions).toHaveLength(1);
  });

  it('repairs a snapshot committed before its family pointer', async () => {
    const source = await seedDesign();
    const input = {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-1', ...source,
      previewUploadId: await previewUpload(),
    };
    await saveGalleryVersion(paths, input);
    await rm(galleryFamilyRecordFile(paths, 'fam-1'));
    await updateState(paths, (state) => ({ ...state, galleryFamilies: [] }));

    await saveGalleryVersion(paths, input);

    expect((await readState(paths)).galleryFamilies[0]?.versions[0]?.id).toBe('ver-1');
  });

  it('duplicates an editable Design from the Gallery-owned snapshot', async () => {
    const source = await seedDesign();
    await saveGalleryVersion(paths, {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-1', ...source,
      previewUploadId: await previewUpload(),
    });
    await rm(path.join(paths.designsDir, 'dsn-1'), { recursive: true, force: true });

    const duplicate = await duplicateGalleryVersion(paths, {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-copy', newFamilyId: 'fam-copy',
      variantId: 'var-copy', revisionId: 'rev-copy',
    });

    expect(duplicate.galleryLineage).toEqual({
      mode: 'duplicate', parentFamilyId: 'fam-1', parentVersionId: 'ver-1',
    });
    expect(duplicate.galleryFamilyId).toBe('fam-copy');
    expect(duplicate.variants[0]?.revisions[0]?.model).toEqual({
      providerId: 'test-provider', modelId: 'test-model',
    });
    expect(duplicate.assets[0]?.reference).toBe('assets/art-1.image');
    const rebuilt = await readFile(
      path.join(revisionDir(paths, 'dsn-copy', 'var-copy', 'rev-copy'), 'preview.html'),
      'utf8',
    );
    expect(rebuilt).toContain('data:image/png;base64');
    const duplicateTweaks = JSON.parse(await readFile(
      path.join(revisionDir(paths, 'dsn-copy', 'var-copy', 'rev-copy'), 'tweaks.json'),
      'utf8',
    )) as { manifest?: { variantRevisionId?: string } };
    expect(duplicateTweaks.manifest?.variantRevisionId).toBe('rev-copy');
  });

  it('reopens the source Design at the exact saved revision', async () => {
    const source = await seedDesign();
    await saveGalleryVersion(paths, {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-1', ...source,
      previewUploadId: await previewUpload(),
    });
    await mutateVariant(paths, 'dsn-1', source.variantId, (variant) => ({
      ...variant,
      visibleRevisionId: 'rev-2',
      revisions: [...variant.revisions, {
        id: 'rev-2', createdAt: 20, jobId: 'job-2',
        files: [{ name: 'index.html', bytes: 10 }], buildWarnings: [], summary: 'Later', name: 'Later',
      }],
    }));

    await new GalleryRequests(paths).apply({ kind: 'gallery.open', familyId: 'fam-1', versionId: 'ver-1' });

    expect((await readDesign(paths, 'dsn-1'))?.variants[0]?.visibleRevisionId).toBe('rev-1');
    expect((await readState(paths)).view.selectedDesignId).toBe('dsn-1');
  });

  it('restores and permanently deletes a Gallery version', async () => {
    const source = await seedDesign();
    await saveGalleryVersion(paths, {
      familyId: 'fam-1', versionId: 'ver-1', designId: 'dsn-1', ...source,
      previewUploadId: await previewUpload(),
    });
    const requests = new GalleryRequests(paths);
    await requests.apply({ kind: 'gallery.delete-version', familyId: 'fam-1', versionId: 'ver-1', deleted: true });
    expect((await readState(paths)).galleryFamilies[0]?.versions[0]?.deletedAt).toEqual(expect.any(Number));

    await requests.apply({ kind: 'gallery.delete-version', familyId: 'fam-1', versionId: 'ver-1', deleted: false });
    expect((await readState(paths)).galleryFamilies[0]?.versions[0]?.deletedAt).toBeUndefined();

    await requests.apply({ kind: 'gallery.purge-version', familyId: 'fam-1', versionId: 'ver-1' });
    expect((await readState(paths)).galleryFamilies).toHaveLength(0);
    await expect(stat(galleryVersionDir(paths, 'fam-1', 'ver-1')).catch(() => null)).resolves.toBeNull();
  });
});
