/**
 * End-to-end runtime behaviour: import, analyse, generate, tweak, checkpoint,
 * save to Gallery and export — all through the real request contract.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { DesignLibraryCoordinator } from '../coordinator';
import { AssetProviderRegistry } from '../asset-generation/registry';
import { designRecordPath, itemRecordPath, jobPath, uploadDir, versionDir } from '../../shared/paths';
import { mutateRecord, readJsonFile } from '../../shared/state-io';
import type {
  DesignRecord,
  GalleryVersionSnapshot,
  JobRecord,
  LibraryItemRecord,
} from '../../shared/records';
import type { RequestAction, RequestMap } from '../../shared/requests';
import { LIBRARIAN_REPLY, createFakeHost, generationReply, type FakeHost } from './fakes';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let host: FakeHost;
let coordinator: DesignLibraryCoordinator;

async function submit<TAction extends RequestAction>(
  action: TAction,
  payload: RequestMap[TAction],
): Promise<void> {
  await host.updateState((current) => ({
    ...current,
    nextRequestId: current.nextRequestId + 1,
    requests: [
      ...current.requests,
      { id: current.nextRequestId, action, payload: payload as never, requestedAt: host.now() },
    ],
  }));
  await coordinator.handleStateChange(await host.state());
  await coordinator.idle();
}

async function stageUpload(): Promise<string> {
  const uploadId = 'upl-test-1';
  const dir = uploadDir(host.paths, uploadId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      uploadId,
      fileName: 'reference.png',
      mimeType: 'image/png',
      source: 'file-picker',
      createdAt: host.now(),
    }),
  );
  await writeFile(path.join(dir, 'payload.bin'), PNG);
  return uploadId;
}

/** Import one image and let the automatic Librarian analysis complete. */
async function importAndAnalyse(): Promise<string> {
  const uploadId = await stageUpload();
  host.replies.push(LIBRARIAN_REPLY);
  await submit('item.ingest-upload', { uploadId, source: 'file-picker', fileName: 'reference.png' });
  const state = await host.state();
  return state.items[0].id;
}

async function createAndGenerate(itemId: string, replies: string[]): Promise<{
  designId: string;
  design: DesignRecord;
}> {
  const designId = 'dsn-test-1';
  await submit('design.create', {
    designId,
    title: 'Ledger board',
    request: 'A dense ledger dashboard',
    outputTarget: 'html',
    itemIds: [itemId],
  });
  replies.forEach((reply) => host.replies.push(reply));
  await submit('design.generate', { designId, variantCount: replies.length });
  const design = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
  return { designId, design: design! };
}

beforeEach(async () => {
  host = await createFakeHost();
  coordinator = new DesignLibraryCoordinator(host, { registry: new AssetProviderRegistry() });
  await coordinator.start();
});

describe('import and Librarian analysis', () => {
  it('stores the item, runs analysis automatically and projects a summary', async () => {
    const itemId = await importAndAnalyse();

    const record = await readJsonFile<LibraryItemRecord>(itemRecordPath(host.paths, itemId));
    expect(record?.analysisStatus).toBe('ready');
    expect(record?.profile?.generated.title).toBe('Quiet ledger');

    const state = await host.state();
    expect(state.items[0].title).toBe('Quiet ledger');
    expect(state.items[0].tags).toContain('quiet');
    expect(state.items[0].checksum).toHaveLength(64);
    expect(state.items[0].searchText).toContain('editorial dashboard');
  });

  it('analyses the image through the read tool rather than a bespoke transport', async () => {
    await importAndAnalyse();
    const run = host.runs[0];
    expect(run.platformTools).toBe('readOnly');
    expect(run.task).toContain('original.png');
    expect(run.cwd).toContain('items');
  });

  it('keeps manual overrides through a reanalysis and resets them on request', async () => {
    const itemId = await importAndAnalyse();

    await submit('item.update-field', { itemId, field: 'title', value: 'My own title' });
    host.replies.push(LIBRARIAN_REPLY.replace('Quiet ledger', 'Regenerated title'));
    await submit('analysis.run', { itemId, reanalyse: true });

    let record = await readJsonFile<LibraryItemRecord>(itemRecordPath(host.paths, itemId));
    expect(record?.profile?.generated.title).toBe('Regenerated title');
    expect(record?.profile?.overrides.title?.value).toBe('My own title');
    expect((await host.state()).items[0].title).toBe('My own title');

    await submit('item.reset-field', { itemId, field: 'title' });
    record = await readJsonFile<LibraryItemRecord>(itemRecordPath(host.paths, itemId));
    expect(record?.profile?.overrides.title).toBeUndefined();
    expect((await host.state()).items[0].title).toBe('Regenerated title');
  });

  it('records a clear failure when the Librarian returns nothing usable', async () => {
    const uploadId = await stageUpload();
    host.replies.push('not json at all');
    await submit('item.ingest-upload', { uploadId, source: 'file-picker', fileName: 'reference.png' });

    const state = await host.state();
    expect(state.items[0].analysisStatus).toBe('failed');
    expect(state.notices.some((notice) => notice.level === 'error')).toBe(true);
  });
});

describe('generation', () => {
  it('creates one independent revision per variant with a validated manifest', async () => {
    const itemId = await importAndAnalyse();
    const { design } = await createAndGenerate(itemId, [generationReply(), generationReply({ title: 'Second' })]);

    expect(design.variants).toHaveLength(2);
    expect(design.variants.every((variant) => variant.status === 'succeeded')).toBe(true);
    const revision = design.variants[0].revisions[0];
    expect(revision.tweakManifest.controls.map((control) => control.id)).toEqual(['page-gap', 'accent']);
    expect(revision.droppedTweakControls).toHaveLength(0);
  });

  it('lets successful siblings survive a failed variant', async () => {
    const itemId = await importAndAnalyse();
    const designId = 'dsn-partial';
    await submit('design.create', {
      designId,
      title: 'Partial',
      request: 'A ledger',
      outputTarget: 'html',
      itemIds: [itemId],
    });
    host.replies.push(generationReply(), 'unusable reply');
    await submit('design.generate', { designId, variantCount: 2 });

    const design = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(design?.variants[0].status).toBe('succeeded');
    expect(design?.variants[1].status).toBe('failed');
    expect(design?.variants[0].revisions).toHaveLength(1);
  });

  it('reports tweak controls that would not have worked and keeps the page', async () => {
    const itemId = await importAndAnalyse();
    const { design } = await createAndGenerate(itemId, [generationReply({
      extraControls: [{
        id: 'ghost',
        group: 'Colour',
        label: 'Ghost control',
        cssVariable: '--never-declared',
        control: { type: 'colour' },
        defaultValue: '#ffffff',
      }],
    })]);

    const revision = design.variants[0].revisions[0];
    expect(revision.tweakManifest.controls).toHaveLength(2);
    expect(revision.droppedTweakControls[0].reason).toContain('--never-declared');
    const state = await host.state();
    expect(state.notices.some((notice) => notice.message.includes('tweak controls were removed'))).toBe(true);
  });

  it('never passes reference pixels to the generator', async () => {
    const itemId = await importAndAnalyse();
    await createAndGenerate(itemId, [generationReply()]);
    const generationRun = host.runs[host.runs.length - 1];
    expect(generationRun.platformTools).toBe('none');
    expect(generationRun.task).not.toContain('original.png');
    expect(generationRun.task).toContain('Editorial dashboard');
  });

  it('writes a runnable preview for the revision', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    const variant = design.variants[0];
    const html = await readFile(
      path.join(
        host.paths.designs,
        designId,
        'variants',
        variant.id,
        variant.revisions[0].id,
        'preview.html',
      ),
      'utf8',
    );
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('window.__SERO_TWEAKS__');
  });
});

describe('tweaks', () => {
  it('autosaves working values without creating a revision, then checkpoints once', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    const variantId = design.variants[0].id;

    for (const value of [2.5, 3, 3.5, 4]) {
      await submit('tweak.update', { designId, variantId, overrides: { 'page-gap': value } });
    }

    let current = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(current?.variants[0].revisions).toHaveLength(1);
    expect(current?.variants[0].tweakWorking?.overrides).toEqual({ 'page-gap': 4 });

    await submit('tweak.checkpoint', { designId, variantId, reason: 'panel-closed' });

    current = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(current?.variants[0].revisions).toHaveLength(2);
    expect(current?.variants[0].revisions[1].createdReason).toBe('tweak-checkpoint');
    expect(current?.variants[0].revisions[1].tweakOverrides).toEqual({ 'page-gap': 4 });
    expect(current?.variants[0].tweakWorking).toBeUndefined();
  });

  it('does not create a revision when a checkpoint has nothing to save', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    const variantId = design.variants[0].id;

    await submit('tweak.checkpoint', { designId, variantId, reason: 'panel-closed' });
    await submit('tweak.checkpoint', { designId, variantId, reason: 'shutdown' });

    const current = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(current?.variants[0].revisions).toHaveLength(1);
  });

  it('rejects a value the manifest does not admit', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    const variantId = design.variants[0].id;

    await submit('tweak.update', { designId, variantId, overrides: { 'page-gap': 999 } });
    await submit('tweak.update', { designId, variantId, overrides: { unknown: 1 } });

    const current = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(current?.variants[0].tweakWorking?.overrides ?? {}).toEqual({});
  });

  it('resets one control and then all of them', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    const variantId = design.variants[0].id;

    await submit('tweak.update', { designId, variantId, overrides: { 'page-gap': 3, accent: '#112233' } });
    await submit('tweak.reset', { designId, variantId, controlId: 'page-gap' });

    let current = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(current?.variants[0].tweakWorking?.overrides).toEqual({ accent: '#112233' });

    await submit('tweak.reset', { designId, variantId });
    current = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(current?.variants[0].tweakWorking?.overrides).toEqual({});
  });
});

describe('Gallery and export', () => {
  it('saves an immutable snapshot with the effective tweak values resolved', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    const variantId = design.variants[0].id;

    await submit('tweak.update', { designId, variantId, overrides: { 'page-gap': 4 } });
    await submit('gallery.save', { designId, variantId });

    const state = await host.state();
    expect(state.families).toHaveLength(1);
    const family = state.families[0];
    const snapshot = await readJsonFile<GalleryVersionSnapshot>(
      path.join(versionDir(host.paths, family.id, family.featuredVersionId), 'version.json'),
    );
    expect(snapshot?.tweakValues).toEqual({ 'page-gap': 4, accent: '#3355ff' });

    const standalone = await readFile(
      path.join(versionDir(host.paths, family.id, family.featuredVersionId), 'standalone.html'),
      'utf8',
    );
    expect(standalone).toContain('--page-gap: 4rem;');
    expect(standalone).not.toContain('__SERO_TWEAKS__');
  });

  it('keeps a saved version intact after its Library source is permanently deleted', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    await submit('gallery.save', { designId, variantId: design.variants[0].id });

    const before = (await host.state()).families[0];
    await submit('item.purge', { itemId });

    const after = await readJsonFile<GalleryVersionSnapshot>(
      path.join(versionDir(host.paths, before.id, before.featuredVersionId), 'version.json'),
    );
    expect(after?.files).toHaveLength(3);

    const record = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(record?.references[0].source.kind).toBe('tombstone');
  });

  it('exports the exact snapshot with a metadata manifest', async () => {
    const itemId = await importAndAnalyse();
    const { designId, design } = await createAndGenerate(itemId, [generationReply()]);
    await submit('gallery.save', { designId, variantId: design.variants[0].id });

    const family = (await host.state()).families[0];
    await submit('export.version', {
      familyId: family.id,
      versionId: family.featuredVersionId,
      destination: 'workspace',
      workspacePath: host.workspacePath,
    });

    const state = await host.state();
    const notice = state.notices.find((entry) => entry.message.startsWith('Exported to'));
    expect(notice).toBeDefined();
    const outputDir = notice!.message.replace('Exported to ', '').replace(/\.$/, '');
    const metadata = JSON.parse(await readFile(path.join(outputDir, 'design-library.json'), 'utf8'));
    expect(metadata.tweakValues['page-gap']).toBe(2);
    expect(await readFile(path.join(outputDir, 'styles.css'), 'utf8')).toContain('--page-gap');
  });
});

describe('restart recovery', () => {
  it('resumes an interrupted analysis after a restart', async () => {
    const uploadId = await stageUpload();
    host.replies.push(LIBRARIAN_REPLY);
    await submit('item.ingest-upload', { uploadId, source: 'file-picker', fileName: 'reference.png' });
    const itemId = (await host.state()).items[0].id;

    // Simulate a crash mid-analysis: the item is left `analysing` and its job
    // is left `running`, which is exactly what an interrupted process leaves.
    await mutateRecord<LibraryItemRecord>(itemRecordPath(host.paths, itemId), (current) => ({
      ...current!,
      analysisStatus: 'analysing',
    }));
    const files = await readdir(host.paths.jobs);
    await mutateRecord<JobRecord>(
      jobPath(host.paths, files[0].replace('.json', '')),
      (current) => ({ ...current!, status: 'running' }),
    );

    const restarted = new DesignLibraryCoordinator(host, { registry: new AssetProviderRegistry() });
    host.replies.push(LIBRARIAN_REPLY);
    await restarted.start();
    await restarted.idle();

    const record = await readJsonFile<LibraryItemRecord>(itemRecordPath(host.paths, itemId));
    expect(record?.analysisStatus).toBe('ready');
  });
});
