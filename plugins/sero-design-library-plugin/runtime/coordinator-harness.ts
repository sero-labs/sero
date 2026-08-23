import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import {
  BASELINE_FONT_OPTIONS,
  BASELINE_TWEAKS,
  hasBaselineTweakPrefix,
} from '../shared/baseline-tweaks';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import { appendRequest, readStateWithIndexes } from '../shared/state-io';
import { beginUpload, completeUpload, writeUploadChunk } from '../shared/uploads';
import { Coordinator } from './coordinator';
import type { CoordinatorContext } from './coordinator-context';
import { invokeTool } from './librarian/test-support';
import { createFakeProvider, type FakeProviderOptions } from './media/providers/fake';
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
  /** A second coordinator with injected export persistence behavior. */
  withExportRequests(
    exportRequests: NonNullable<CoordinatorContext['exportRequests']>,
    failures: string[],
  ): Coordinator;
}

/**
 * Polling options for `vi.waitFor`. The work these tests wait on lands in well
 * under a millisecond, so with the default 50ms interval nearly all the measured
 * time is the gap between polls rather than the work. Only the interval changes;
 * the timeout is left alone, so a run that never finishes still fails the same
 * way it did before.
 */
export const FAST_POLL = { interval: 1 } as const;

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

function toolNamed(params: AppRuntimeSubagentRunParams, name: string): ToolDefinition | undefined {
  return ((params.customTools ?? []) as ToolDefinition[]).find((tool) => tool.name === name);
}

/** True when this run is generating a design rather than analysing a reference. */
export function isGenerationRun(params: AppRuntimeSubagentRunParams): boolean {
  return toolNamed(params, 'design_library_write_file') !== undefined;
}

/**
 * The analysis half of the stub, for tests that replace only the generation half.
 * A Design cannot exist without an analysed reference, so every one of them still
 * needs this to behave.
 */
export async function stubAnalysisRun(params: AppRuntimeSubagentRunParams) {
  await viewReference(params);
  return { response: ANALYSIS_REPLY, modelId: 'stub-model', providerId: 'stub' };
}

/**
 * The default generated page: enough to build and render, small enough to read in
 * a failure message.
 */
export const BASELINE_STYLE = `<style>:root{--font-family:system-ui,sans-serif;--h1-size:48px;--h1-weight:650;--h1-tracking:-0.04em;--h2-size:28px;--body-font:system-ui,sans-serif;--body-size:16px}h1,h2{font-family:var(--font-family)}h1{font-size:var(--h1-size);font-weight:var(--h1-weight);letter-spacing:var(--h1-tracking)}h2{font-size:var(--h2-size)}body{font-family:var(--body-font);font-size:var(--body-size)}</style>`;

export const BASELINE_CONTROLS: Array<Record<string, unknown>> = BASELINE_TWEAKS.map((control) => {
  const definition = { ...control, group: 'Typography' };
  switch (control.id) {
    case 'font':
    case 'body-font':
      return { ...definition, defaultValue: 'system-ui, sans-serif', options: BASELINE_FONT_OPTIONS };
    case 'h1-weight':
      return { ...definition, defaultValue: '650', options: ['400', '650', '800'].map((value) => ({ label: value, value })) };
    case 'h1-tracking':
      return { ...definition, defaultValue: '-0.04', min: -0.1, max: 0.1, step: 0.01, unit: 'em' };
    case 'h1-size':
      return { ...definition, defaultValue: '48', min: 24, max: 96, step: 1, unit: 'px' };
    case 'h2-size':
      return { ...definition, defaultValue: '28', min: 16, max: 64, step: 1, unit: 'px' };
    case 'body-size':
      return { ...definition, defaultValue: '16', min: 12, max: 24, step: 1, unit: 'px' };
  }
});

export const STUB_PAGE = `<body>${BASELINE_STYLE}<h1>Generated page</h1><h2>Section</h2><p id="generated">Generated page</p></body>`;

/**
 * Write files the way a generation run does. Nothing is accepted from a run that
 * never called the tool, so a stub has to call it for the variant to succeed.
 */
export async function writeDesignFiles(
  params: AppRuntimeSubagentRunParams,
  files: Array<{ name: string; content: string }>,
  withBaseline = true,
): Promise<void> {
  const writer = toolNamed(params, 'design_library_write_file');
  if (!writer) return;
  for (const file of files) await invokeTool(writer, file);
  if (withBaseline) await declareTweaks(params, BASELINE_CONTROLS);
}

/**
 * A page whose decisions run through custom properties, so controls declared
 * over it survive validation. The plain `STUB_PAGE` deliberately does not — a
 * design with nothing adjustable is a real case, and the two are used to tell
 * "no manifest" from "a manifest that was dropped".
 */
export const STUB_TWEAKABLE_PAGE =
  `<body>${BASELINE_STYLE}<style>:root{--signal:#16805f;--gap:12px}main{color:var(--signal);gap:var(--gap)}</style><h1>Generated page</h1><h2>Section</h2><main id="generated">Generated page</main></body>`;

/** Declare tweak controls the way a generation run does, through its tool. */
export async function declareTweaks(
  params: AppRuntimeSubagentRunParams,
  controls: Array<Record<string, unknown>>,
): Promise<void> {
  const tool = toolNamed(params, 'design_library_declare_tweaks');
  const complete = hasBaselineTweakPrefix(controls) ? controls : [...BASELINE_CONTROLS, ...controls];
  if (tool) await invokeTool(tool, { controls: complete });
}

/** Name the design the way a generation run does, through its tool. */
export async function nameDesign(
  params: AppRuntimeSubagentRunParams,
  naming: { name: string; summary: string },
): Promise<void> {
  const namer = toolNamed(params, 'design_library_name_design');
  if (namer) await invokeTool(namer, naming);
}

/**
 * A stub that behaves like a model that does its job, for both kinds of run: it
 * looks at the reference before analysing, and writes and names a design. Which
 * run it is answering is decided by the tool it was handed.
 */
function stubHost(options: HarnessOptions = {}): {
  host: AppRuntimeHost;
  runStructured: ReturnType<typeof vi.fn>;
} {
  const runStructured = vi.fn(async (params: AppRuntimeSubagentRunParams) => {
    if (toolNamed(params, 'design_library_write_file')) {
      await writeDesignFiles(params, [{ name: 'index.html', content: STUB_PAGE }]);
      await nameDesign(params, { name: 'Signal ledger', summary: 'Typography-led panel.' });
      return { response: 'done', modelId: 'stub-model', providerId: 'stub' };
    }
    await viewReference(params);
    return { response: ANALYSIS_REPLY, modelId: 'stub-model', providerId: 'stub' };
  });

  // Media generation asks before it spends on video. The stub declines, which
  // is the right default for a test: an approval nobody wrote is exactly the
  // thing the confirmation exists to prevent, so a test that wants video has to
  // say so.
  const notifications = {
    notify: () => undefined,
    requestChoice: async () => ({
      choiceId: options.approveVideo === true ? 'generate' : 'skip',
      timedOut: false,
    }),
  };

  return {
    host: { subagents: { runStructured }, notifications } as unknown as AppRuntimeHost,
    runStructured,
  };
}

/**
 * Install the harness for the current test file. Call at module scope; it
 * registers its own `beforeEach`/`afterEach`, and every field is read through
 * the returned object so it always sees the current test's instances.
 */
export interface HarnessOptions {
  /**
   * Options for the fake media provider — how it should fail, how slowly, what
   * it should claim to cost. This is the fault-injection seam: the whole
   * request → job → record path runs against it with no network and no spend.
   */
  provider?: FakeProviderOptions;
  /**
   * Answer the video confirmation with "generate".
   *
   * Off by default and deliberately so: an approval nobody wrote is exactly
   * what the confirmation exists to prevent, so a test that wants video has to
   * say so out loud.
   */
  approveVideo?: boolean;
}

export function useCoordinator(label: string, options: HarnessOptions = {}): CoordinatorHarness {
  let home = '';
  let paths: DesignLibraryPaths;
  let coordinator: Coordinator;
  let runStructured: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), `design-library-${label}-`));
    paths = designLibraryPathsFromHome(home);
    const stub = stubHost(options);
    runStructured = stub.runStructured;
    // One provider for the whole test, not one per job. The fake counts calls
    // so `failFirst` can let a retry succeed, and a fresh instance per job
    // would reset that counter and fail every attempt forever.
    const provider = createFakeProvider({ costUsd: 0.01, ...options.provider });
    coordinator = new Coordinator({
      host: stub.host,
      paths,
      workspaceId: 'ws',
      sessionId: 'session',
      onError: () => undefined,
      // Deterministic media, so the request → job → record path is exercised
      // without network or spend.
      createMediaProvider: async () => provider,
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
      const state = await readStateWithIndexes(paths);
      const itemId = state.items[state.items.length - 1]!.id;
      await vi.waitFor(async () => {
        expect((await readItem(paths, itemId))?.analysis.status).toBe('ready');
      }, FAST_POLL);
      return itemId;
    },
    withErrors(failures) {
      // The same stub, not a fresh one: this stands for Sero restarting, and a
      // restart does not come back with a different model. A test that has said
      // how the model behaves means that for the resumed work too — otherwise
      // the run it is asserting on is served by a stub it never configured.
      return new Coordinator({
        host: { subagents: { runStructured } } as unknown as AppRuntimeHost,
        paths,
        workspaceId: 'ws',
        sessionId: 'session',
        onError: (message) => failures.push(message),
      });
    },
    withExportRequests(exportRequests, failures) {
      return new Coordinator({
        host: { subagents: { runStructured } } as unknown as AppRuntimeHost,
        paths,
        workspaceId: 'ws',
        sessionId: 'session',
        onError: (message) => failures.push(message),
        exportRequests,
      });
    },
  };
}
