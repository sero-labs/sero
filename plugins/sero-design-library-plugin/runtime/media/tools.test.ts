import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
  assetCostUsd,
  currentAttempt,
  designCostUsd,
} from '../../shared/media';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import type { DesignAsset } from '../../shared/media';
import { readDesign } from '../design-store';
import { invokeTool } from '../librarian/test-support';
import { seedDesign, seedItem } from '../test-fixtures';
import { readAssetBytes } from './assets';
import { MediaBudget } from './budget';
import { MediaError } from './contract';
import { createFakeProvider } from './providers/fake';
import { createMediaTools, generateAsset, generateForAsset, type MediaToolContext } from './tools';

const DESIGN_ID = 'media-design';

/** Unwrap a generation that was meant to succeed, failing loudly when it did not. */
function expectAsset(outcome: { asset: DesignAsset } | { refused: string }): DesignAsset {
  if ('refused' in outcome) throw new Error(`Expected an asset, but it was refused: ${outcome.refused}`);
  return outcome.asset;
}

describe('media tools', () => {
  let paths: DesignLibraryPaths;

  beforeEach(async () => {
    paths = designLibraryPathsFromHome(await mkdtemp(path.join(tmpdir(), 'design-library-tools-')));
    await seedDesign(paths, DESIGN_ID);
  });

  afterEach(async () => {
    await rm(paths.home, { recursive: true, force: true });
  });

  const context = (overrides: Partial<MediaToolContext> = {}): MediaToolContext => ({
    paths,
    designId: DESIGN_ID,
    provider: createFakeProvider({ costUsd: 0.02 }),
    budget: new MediaBudget({ callsPerRun: 4, confirmVideo: async () => true }),
    signal: new AbortController().signal,
    librarySources: 'all',
    ...overrides,
  });

  it('exposes one tool per capability', () => {
    const tools = createMediaTools(context());

    expect(tools.map((tool) => tool.name)).toEqual([
      'design_library_generate_image',
      'design_library_restyle_image',
      'design_library_upscale_image',
      'design_library_generate_video',
      'design_library_animate_image',
    ]);
  });

  it('keeps imported Library pixels out of generation media tools', async () => {
    await seedItem(paths, 'imported-item', { status: 'ready' });
    const budget = new MediaBudget({ callsPerRun: 4, confirmVideo: async () => true });
    const tools = createMediaTools(context({ budget, librarySources: 'plugin-owned' }));
    const restyle = tools.find((tool) => tool.name === 'design_library_restyle_image')!;

    const result = await invokeTool(restyle, {
      sourceId: 'imported-item',
      prompt: 'make it quieter',
    });

    expect(result.details).toMatchObject({ ok: false });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('language-only') }),
    ]);
    expect(budget.callsUsed).toBe(0);
    expect((await readDesign(paths, DESIGN_ID))?.assets).toHaveLength(0);
  });

  it('lets generation media tools use plugin-made Library pixels', async () => {
    await seedItem(paths, 'generated-item', { status: 'ready', sourceKind: 'generated' });
    const tools = createMediaTools(context({ librarySources: 'plugin-owned' }));
    const restyle = tools.find((tool) => tool.name === 'design_library_restyle_image')!;

    const result = await invokeTool(restyle, {
      sourceId: 'generated-item',
      prompt: 'make it quieter',
    });

    expect(result.details).toMatchObject({ ok: true });
    expect((await readDesign(paths, DESIGN_ID))?.assets).toHaveLength(1);
  });

  it('records a generated asset on the Design with its provenance', async () => {
    const outcome = await generateAsset(
      'text-to-image',
      { capability: 'text-to-image', prompt: 'a wide hero' },
      context(),
    );

    expect('asset' in outcome).toBe(true);
    const design = await readDesign(paths, DESIGN_ID);
    const [asset] = design?.assets ?? [];
    expect(asset.request.prompt).toBe('a wide hero');
    expect(currentAttempt(asset)?.outcome).toBe('ready');
    expect(currentAttempt(asset)?.provenance?.providerId).toBe('fake');
    // The job that produced it is released once an attempt has landed, so
    // reconciliation does not mistake a finished asset for an abandoned one.
    expect(asset.jobId).toBeUndefined();
  });

  it('keeps a failed asset as a retryable placeholder rather than losing it', async () => {
    const outcome = await generateAsset(
      'text-to-image',
      { capability: 'text-to-image', prompt: 'a wide hero' },
      context({ provider: createFakeProvider({ failWith: new MediaError('provider', 'boom', true) }) }),
    );

    expect('asset' in outcome).toBe(true);
    const design = await readDesign(paths, DESIGN_ID);
    const [asset] = design?.assets ?? [];
    expect(currentAttempt(asset)?.outcome).toBe('failed');
    expect(currentAttempt(asset)?.error?.retryable).toBe(true);
    // A page pointing at it renders a placeholder, so the reference still exists.
    expect(asset.reference).toMatch(/^assets\//);
  });

  it('preserves the failure when a retry succeeds', async () => {
    // Fails once, then succeeds — so one asset carries both outcomes.
    const shared = context({ provider: createFakeProvider({ failFirst: 1 }) });

    const first = expectAsset(
      await generateAsset(
        'text-to-image',
        { capability: 'text-to-image', prompt: 'a wide hero' },
        shared,
      ),
    );
    expect(currentAttempt(first)?.outcome).toBe('failed');

    const asset = expectAsset(await generateForAsset(first, shared));

    expect(asset.attempts).toHaveLength(2);
    expect(asset.attempts[0].outcome).toBe('failed');
    expect(currentAttempt(asset)?.outcome).toBe('ready');
    // The reference never moved, so the page written against it still resolves
    // — which is the whole point of retrying the asset rather than replacing it.
    expect(asset.reference).toBe(first.reference);
  });

  it('replays the original request on retry rather than rebuilding it', async () => {
    const shared = context({ provider: createFakeProvider({ failFirst: 1 }) });

    const first = expectAsset(
      await generateAsset(
        'text-to-image',
        { capability: 'text-to-image', prompt: 'a wide hero', aspectRatio: '16:9', seed: 7 },
        shared,
      ),
    );
    await generateForAsset(first, shared);

    const design = await readDesign(paths, DESIGN_ID);
    const provenance = currentAttempt(design!.assets[0])?.provenance;
    expect(provenance?.prompt).toBe('a wide hero');
    expect(provenance?.seed).toBe(7);
  });

  it('refuses a call past the per-run cap without failing anything', async () => {
    const budget = new MediaBudget({ callsPerRun: 1, confirmVideo: async () => true });
    const shared = context({ budget });

    await generateAsset('text-to-image', { capability: 'text-to-image', prompt: 'one' }, shared);
    const refused = await generateAsset(
      'text-to-image',
      { capability: 'text-to-image', prompt: 'two' },
      shared,
    );

    expect('refused' in refused).toBe(true);
    const design = await readDesign(paths, DESIGN_ID);
    // Nothing was reserved for the refused call: a placeholder for artwork that
    // was never attempted would offer a retry the cap would refuse again.
    expect(design?.assets).toHaveLength(1);
  });

  it('refuses video the user declined, and spends nothing on it', async () => {
    const budget = new MediaBudget({ callsPerRun: 3, confirmVideo: async () => false });

    const refused = await generateAsset(
      'text-to-video',
      { capability: 'text-to-video', prompt: 'a slow pan' },
      context({ budget }),
    );

    expect(refused).toMatchObject({ refused: expect.stringContaining('not approved') });
    expect(budget.callsUsed).toBe(0);
    expect((await readDesign(paths, DESIGN_ID))?.assets).toHaveLength(0);
  });

  /** Records every length the confirmation was asked to approve. */
  function recordingBudget(asked: (number | undefined)[]): MediaBudget {
    return new MediaBudget({
      callsPerRun: 4,
      confirmVideo: async ({ durationSeconds }) => {
        asked.push(durationSeconds);
        return true;
      },
    });
  }

  /** A model that takes 5 or 10 seconds and rejects everything else, as fal's does. */
  const fixedLengths = { 'text-to-video': { durationsSeconds: [5, 10] } };

  it('asks only for a length the model accepts', async () => {
    // The manual pass found this the hard way: 4 seconds went to a model that
    // takes 5 or 10, and the provider refused the request outright. Nothing was
    // charged and nothing was produced, which is the worst of both.
    const asked: (number | undefined)[] = [];
    const budget = recordingBudget(asked);
    const shared = context({
      budget,
      provider: createFakeProvider({ modelOptions: fixedLengths }),
    });

    await generateAsset(
      'text-to-video',
      { capability: 'text-to-video', prompt: 'a pan', durationSeconds: 4 },
      shared,
    );
    // Nobody said, so the default settles to the nearest length on offer.
    await generateAsset('text-to-video', { capability: 'text-to-video', prompt: 'a pan two' }, shared);
    // Longer than anything the model does, and longer than our own ceiling.
    await generateAsset(
      'text-to-video',
      { capability: 'text-to-video', prompt: 'a long pan', durationSeconds: 90 },
      shared,
    );

    expect(asked).toEqual([5, DEFAULT_VIDEO_SECONDS, 10]);
    const design = await readDesign(paths, DESIGN_ID);
    // The asset stores what was actually run, so a retry replays that clip
    // rather than the number originally asked for.
    expect(design?.assets.map((asset) => asset.request.durationSeconds)).toEqual([5, 5, 10]);
  });

  it('leaves the length to the model when the provider cannot say', async () => {
    // A private endpoint, or a machine offline at that moment. A number invented
    // here would be a guess the provider is free to reject; its own default is
    // at least a length it can produce, and the confirmation says as much.
    const asked: (number | undefined)[] = [];
    const shared = context({ budget: recordingBudget(asked) });

    await generateAsset('text-to-video', { capability: 'text-to-video', prompt: 'a pan' }, shared);
    await generateAsset(
      'text-to-video',
      { capability: 'text-to-video', prompt: 'a long pan', durationSeconds: 90 },
      shared,
    );

    // What was asked for is still bounded — that ceiling is ours, not the
    // provider's — but an absent length stays absent.
    expect(asked).toEqual([undefined, MAX_VIDEO_SECONDS]);
  });

  it('settles a stored duration on retry, however it got there', async () => {
    // A request written before the ceiling existed, by another process, or
    // against a model that has since changed in Settings.
    const asked: (number | undefined)[] = [];
    const shared = context({
      budget: recordingBudget(asked),
      provider: createFakeProvider({ modelOptions: fixedLengths }),
    });
    const asset = expectAsset(
      await generateAsset('text-to-video', { capability: 'text-to-video', prompt: 'a pan' }, shared),
    );

    await generateForAsset(
      { ...asset, request: { ...asset.request, durationSeconds: 300 } },
      shared,
    );

    expect(asked).toEqual([DEFAULT_VIDEO_SECONDS, 10]);
  });

  it('will not buy a clip from a model that makes nothing short enough', async () => {
    // The ceiling is a promise about what one press can cost. Taking the
    // model's shortest clip instead would break it exactly where it counts.
    const asked: (number | undefined)[] = [];
    const budget = recordingBudget(asked);
    const outcome = await generateAsset(
      'text-to-video',
      { capability: 'text-to-video', prompt: 'a pan' },
      context({
        budget,
        provider: createFakeProvider({
          modelOptions: { 'text-to-video': { durationsSeconds: [20, 40] } },
        }),
      }),
    );

    expect(outcome).toMatchObject({ refused: expect.stringContaining('shorter') });
    expect(asked).toEqual([]);
    expect(budget.callsUsed).toBe(0);
    expect((await readDesign(paths, DESIGN_ID))?.assets).toHaveLength(0);
  });

  it('records the model that settled a retry, not just the length', async () => {
    // The asset should say what was actually bought. A record that still names
    // the number the user typed is a record of something that never happened.
    const shared = context({
      provider: createFakeProvider({ modelOptions: fixedLengths }),
    });
    const asset = expectAsset(
      await generateAsset('text-to-video', { capability: 'text-to-video', prompt: 'a pan' }, shared),
    );

    await generateForAsset({ ...asset, request: { ...asset.request, durationSeconds: 300 } }, shared);

    const stored = (await readDesign(paths, DESIGN_ID))?.assets.find(
      (entry) => entry.id === asset.id,
    );
    expect(stored?.request.durationSeconds).toBe(10);
    const model = stored?.request.model;
    expect(model).toBeDefined();

    // And it is the recorded model a later retry uses, not whatever Settings
    // happens to say by then — the asset replays what it actually bought.
    const resettled = expectAsset(
      await generateForAsset(stored!, {
        ...shared,
        provider: { ...createFakeProvider({ modelOptions: fixedLengths }), defaultModel: () => 'a-different-model' },
      }),
    );
    expect(currentAttempt(resettled)?.provenance?.model).toBe(model);
  });

  it('totals reported cost per asset and per Design', async () => {
    const shared = context();
    await generateAsset('text-to-image', { capability: 'text-to-image', prompt: 'one' }, shared);
    await generateAsset('text-to-image', { capability: 'text-to-image', prompt: 'two' }, shared);

    const design = await readDesign(paths, DESIGN_ID);
    expect(assetCostUsd(design!.assets[0])).toBeCloseTo(0.02);
    expect(designCostUsd(design!.assets)).toBeCloseTo(0.04);
  });

  it('offers only ready assets to the build', async () => {
    const shared = context();
    await generateAsset('text-to-image', { capability: 'text-to-image', prompt: 'good' }, shared);
    await generateAsset(
      'text-to-image',
      { capability: 'text-to-image', prompt: 'bad' },
      context({ provider: createFakeProvider({ failWith: new MediaError('provider', 'boom', true) }) }),
    );

    const design = await readDesign(paths, DESIGN_ID);
    const forBuild = await readAssetBytes(paths, design!);

    expect(design?.assets).toHaveLength(2);
    // The failed one is absent, so the page gets a placeholder rather than a
    // reference to a file with nothing behind it.
    expect(forBuild).toHaveLength(1);
    expect(forBuild[0].reference).toBe(design?.assets[0].reference);
  });

  it('tells the model where the artwork went, in terms it can use', async () => {
    const [imageTool] = createMediaTools(context());

    const result = await invokeTool(imageTool, { prompt: 'a wide hero' });

    const details = result.details as { ok: boolean; reference: string };
    expect(details.ok).toBe(true);
    expect(details.reference).toMatch(/^assets\//);
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('assets/') });
  });

  it('reports a provider failure to the model as something to carry on past', async () => {
    const [imageTool] = createMediaTools(
      context({ provider: createFakeProvider({ failWith: new MediaError('provider', 'boom', true) }) }),
    );

    const result = await invokeTool(imageTool, { prompt: 'a wide hero' });

    expect(result.details).toMatchObject({ ok: false });
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('carry on with the design'),
    });
  });

  it('refuses a source-consuming call with no source before spending a slot', async () => {
    const budget = new MediaBudget({ callsPerRun: 2, confirmVideo: async () => true });
    const tools = createMediaTools(context({ budget }));
    const upscale = tools.find((tool) => tool.name === 'design_library_upscale_image');

    const result = await invokeTool(upscale!);

    expect(result.details).toMatchObject({ ok: false });
    // Checked before the budget is touched, so a malformed call costs nothing.
    expect(budget.callsUsed).toBe(0);
  });
});
