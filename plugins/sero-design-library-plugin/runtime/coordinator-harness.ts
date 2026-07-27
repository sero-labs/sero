import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import { appendRequest, readState } from '../shared/state-io';
import { beginUpload, completeUpload, writeUploadChunk } from '../shared/uploads';
import { Coordinator } from './coordinator';
import { invokeTool } from './librarian/test-support';
import { readItem } from './store';

/**
 * One coordinator over real records and a stubbed model, so the tests cover the
 * paths that matter without a network call. Shared by the coordinator test files
 * rather than copied, so a change to the analysis stub cannot leave one of them
 * exercising a model that behaves differently.
 */

export interface CoordinatorHarness {
  readonly paths: DesignLibraryPaths;
  readonly coordinator: Coordinator;
  /** The stubbed `runStructured`, for asserting on the params a run was given. */
  readonly runStructured: ReturnType<typeof vi.fn>;
  /** Assemble one upload, leaving the import request to the caller. */
  upload(uploadId: string, fileName: string, content: string): Promise<void>;
  /** Import one reference and wait for its automatic analysis to land. */
  importAndAnalyse(uploadId: string, fileName: string, content: string): Promise<string>;
  /** A second coordinator over the same storage, with error reporting captured. */
  withErrors(failures: string[]): Coordinator;
}

export const ANALYSIS_REPLY = JSON.stringify({
  title: 'Analysed title',
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

/**
 * Do what the run requires before it will accept an analysis: look at the
 * reference. A reply produced without this call is rejected outright, so any
 * stub standing in for a working model has to make it.
 */
export async function viewReference(params: AppRuntimeSubagentRunParams): Promise<void> {
  const tools = (params.customTools ?? []) as ToolDefinition[];
  const viewer = tools.find((tool) => tool.name === 'design_library_view_reference');
  if (viewer) await invokeTool(viewer);
}

/** A stub that behaves like a model that does its job. */
function stubHost(): { host: AppRuntimeHost; runStructured: ReturnType<typeof vi.fn> } {
  const runStructured = vi.fn(async (params: AppRuntimeSubagentRunParams) => {
    await viewReference(params);
    return { response: ANALYSIS_REPLY, modelId: 'stub-model', providerId: 'stub' };
  });
  return { host: { subagents: { runStructured } } as unknown as AppRuntimeHost, runStructured };
}

/**
 * Install the harness for the current test file. Call at module scope; it
 * registers its own `beforeEach`/`afterEach`, and every field is read through
 * the returned object so it always sees the current test's instances.
 */
export function useCoordinator(label: string): CoordinatorHarness {
  let home = '';
  let paths: DesignLibraryPaths;
  let coordinator: Coordinator;
  let runStructured: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), `design-library-${label}-`));
    paths = designLibraryPathsFromHome(home);
    const stub = stubHost();
    runStructured = stub.runStructured;
    coordinator = new Coordinator({
      host: stub.host,
      paths,
      workspaceId: 'ws',
      sessionId: 'session',
      onError: () => undefined,
    });
  });

  afterEach(async () => {
    await coordinator.dispose();
    await rm(home, { recursive: true, force: true });
  });

  async function upload(id: string, fileName: string, content: string): Promise<void> {
    await beginUpload(paths, {
      id,
      fileName,
      mediaType: 'image/png',
      kind: 'image',
      sourceKind: 'file',
      chunkCounts: { original: 1, preview: 0 },
      previewMediaType: 'image/webp',
      createdAt: Date.now(),
      complete: false,
    });
    await writeUploadChunk(paths, id, 'original', 0, Buffer.from(content).toString('base64'));
    await completeUpload(paths, id);
  }

  return {
    get paths() {
      return paths;
    },
    get coordinator() {
      return coordinator;
    },
    get runStructured() {
      return runStructured;
    },
    upload,
    async importAndAnalyse(uploadId, fileName, content) {
      await upload(uploadId, fileName, content);
      await appendRequest(paths, { kind: 'ingest', uploadId });
      await coordinator.drain();
      const state = await readState(paths);
      const itemId = state.items[state.items.length - 1]!.id;
      await vi.waitFor(async () => {
        expect((await readItem(paths, itemId))?.analysis.status).toBe('ready');
      });
      return itemId;
    },
    withErrors(failures) {
      return new Coordinator({
        host: stubHost().host,
        paths,
        workspaceId: 'ws',
        sessionId: 'session',
        onError: (message) => failures.push(message),
      });
    },
  };
}
