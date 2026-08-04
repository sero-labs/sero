import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { emptyAnalysis } from '../../shared/librarian';
import { designLibraryPathsFromHome, itemDir, type DesignLibraryPaths } from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';
import { ITEM_SCHEMA_VERSION } from '../../shared/records';
import { runLibrarian } from './run';
import { invokeTool } from './test-support';

/**
 * These pin the call itself, not the model's prose.
 *
 * Two failures live here. The run once died with "Either agent name or
 * systemPrompt is required" — a contract violation no prompt tuning could fix.
 * Then, once it ran, the model could not reach the image and wrote a confident
 * profile about a picture it had never seen, which is worse than failing.
 */

let home: string;
let paths: DesignLibraryPaths;

const VALID_REPLY = JSON.stringify({
  title: 'Northstar operations',
  primaryStyle: 'Technical monochrome',
  designTypes: ['dashboard'],
  tags: ['a', 'b', 'c', 'd', 'e', 'f'],
  summary: 'A summary.',
  designIntent: 'An intent.',
  aestheticVocabulary: [{ term: 'exact' }],
  visualProfile: { colour: ['near-black'] },
  palette: [{ hex: '#0b0b0d', role: 'background' }],
  always: ['Keep geometry square'],
  never: ['Decorative gradients'],
  generationPrompt: Array.from({ length: 100 }, () => 'word').join(' '),
  confidence: 0.9,
});

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-run-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function item(kind: 'image' | 'video' = 'image'): ItemRecord {
  const now = Date.now();
  return {
    id: 'item-1',
    schemaVersion: ITEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    kind,
    source: { kind: 'file', fileName: 'shot.png' },
    asset: {
      originalFile: 'original.png',
      previewFile: 'preview.webp',
      mediaType: 'image/png',
      bytes: 4,
      checksum: 'abc',
    },
    profile: { generated: emptyAnalysis('shot'), overrides: {} },
    analysis: { status: 'pending', attempts: 0 },
    favourite: false,
    collectionIds: [],
  };
}

async function writeImage(record: ItemRecord, bytes = 'PNGDATA'): Promise<void> {
  await mkdir(itemDir(paths, record.id), { recursive: true });
  await writeFile(path.join(itemDir(paths, record.id), record.asset.originalFile), bytes);
}

interface Capture {
  host: AppRuntimeHost;
  calls: AppRuntimeSubagentRunParams[];
}

/**
 * Stub host. `viewImage` decides whether the simulated model calls the
 * reference tool before replying — which is exactly the behaviour under test.
 */
function capture(response: string, viewImage: boolean): Capture {
  const calls: AppRuntimeSubagentRunParams[] = [];
  const runStructured = vi.fn(async (params: AppRuntimeSubagentRunParams) => {
    calls.push(params);
    if (viewImage) {
      const tool = (params.customTools as ToolDefinition[])[0];
      await invokeTool(tool);
    }
    return { response };
  });
  return { host: { subagents: { runStructured } } as unknown as AppRuntimeHost, calls };
}

function context(host: AppRuntimeHost) {
  return {
    host,
    paths,
    workspaceId: 'ws',
    parentSessionId: 'session',
    model: { providerId: '', modelId: '' },
    signal: new AbortController().signal,
  };
}

describe('the subagent call', () => {
  it('always supplies a system prompt, which the host requires', async () => {
    const { host, calls } = capture(VALID_REPLY, true);
    await runLibrarian(item(), context(host));

    expect(calls[0].systemPrompt).toBeTruthy();
    expect(calls[0].systemPrompt).toContain('Librarian');
  });

  it('gives the session no platform tools at all', async () => {
    // Stricter than read-only: with only the reference tool available, a
    // reference cannot cause a read, a write or a command.
    const { host, calls } = capture(VALID_REPLY, true);
    await runLibrarian(item(), context(host));

    expect(calls[0].platformTools).toBe('none');
    expect((calls[0].customTools as ToolDefinition[]).map((tool) => tool.name)).toEqual([
      'design_library_view_reference',
    ]);
  });

  it('never puts a filesystem path in the prompts', async () => {
    // The platform read tool is scoped to the workspace and a Library item is
    // not in it, so a path would only invite the model to fail.
    const record = item();
    await writeImage(record);
    const { host, calls } = capture(VALID_REPLY, true);
    await runLibrarian(record, context(host));

    expect(calls[0].task).not.toContain(home);
    expect(calls[0].systemPrompt).not.toContain(home);
  });

  it('asks for motion language only for video references', async () => {
    const image = capture(VALID_REPLY, true);
    await runLibrarian(item('image'), context(image.host));
    expect(image.calls[0].systemPrompt).not.toContain('motion language');

    const video = capture(VALID_REPLY, true);
    await runLibrarian(item('video'), context(video.host));
    expect(video.calls[0].systemPrompt).toContain('motion language');
  });

  it('omits the model when no selection is pinned, so Sero’s configured model is used', async () => {
    const { host, calls } = capture(VALID_REPLY, true);
    await runLibrarian(item(), context(host));
    expect(calls[0].model).toBeUndefined();

    const pinned = capture(VALID_REPLY, true);
    await runLibrarian(item(), {
      ...context(pinned.host),
      model: { providerId: 'anthropic', modelId: 'claude-opus-5' },
    });
    expect(pinned.calls[0].model).toBe('claude-opus-5');
  });

  it('reports a host rejection with its reason intact', async () => {
    const runStructured = vi.fn(async () => ({
      response: '',
      error: 'Either agent name or systemPrompt is required',
    }));
    const host = { subagents: { runStructured } } as unknown as AppRuntimeHost;

    const outcome = await runLibrarian(item(), context(host));
    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Either agent name or systemPrompt is required',
    });
  });
});

describe('the reference image tool', () => {
  it('returns the original image bytes to the model', async () => {
    const record = item();
    await writeImage(record, 'REAL-PNG-BYTES');

    const { host, calls } = capture(VALID_REPLY, true);
    await runLibrarian(record, context(host));

    const tool = (calls[0].customTools as ToolDefinition[])[0];
    const result = await invokeTool(tool);
    const image = result.content.find((block) => block.type === 'image');

    expect(image).toBeDefined();
    expect(image && 'mimeType' in image ? image.mimeType : '').toBe('image/png');
    expect(image && 'data' in image ? Buffer.from(image.data, 'base64').toString() : '').toBe(
      'REAL-PNG-BYTES',
    );
  });
});

describe('refusing analysis of an image the model never saw', () => {
  it('fails a well-formed reply produced without viewing the image', async () => {
    const record = item();
    await writeImage(record);

    // A perfectly valid-looking profile — and pure invention.
    const { host } = capture(VALID_REPLY, false);
    const outcome = await runLibrarian(record, context(host));

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.reason).toContain('without viewing the reference image');
  });

  it('names the read failure when the image is missing from disk', async () => {
    // No writeImage: the tool is called but the file is not there.
    const { host } = capture(VALID_REPLY, true);
    const outcome = await runLibrarian(item(), context(host));

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.reason).toContain('could not be read');
    expect(outcome.reason).toContain('ENOENT');
  });

  it('accepts the analysis once the image has actually been viewed', async () => {
    const record = item();
    await writeImage(record);

    const { host } = capture(VALID_REPLY, true);
    const outcome = await runLibrarian(record, context(host));

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.analysis.primaryStyle).toBe('Technical monochrome');
  });

  it('asks the model to look before anything else is worth checking', async () => {
    const { host, calls } = capture(VALID_REPLY, false);
    await runLibrarian(item(), context(host));

    const repair = calls[0].repair?.validate(VALID_REPLY);
    expect(repair).toContain('design_library_view_reference');
  });
});
