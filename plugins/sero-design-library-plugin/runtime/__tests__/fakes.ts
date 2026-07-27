/**
 * A real storage root in a temporary directory plus a scripted model, so the
 * whole runtime can be exercised without Sero or a provider.
 */

import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { storagePathsFromRoot } from '../../shared/paths';
import { mutateState, readState } from '../../shared/state-io';
import { DEFAULT_STATE, type DesignLibraryState } from '../../shared/state';
import type { ModelRunParams, ModelRunResult, RuntimeHost } from '../host';

export interface FakeHost extends RuntimeHost {
  runs: ModelRunParams[];
  replies: Array<string | ((params: ModelRunParams) => string)>;
  state(): Promise<DesignLibraryState>;
  secrets: Record<string, string>;
}

export async function createFakeHost(): Promise<FakeHost> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dl-runtime-'));
  const paths = storagePathsFromRoot(root);
  const runs: ModelRunParams[] = [];
  const replies: Array<string | ((params: ModelRunParams) => string)> = [];
  const secrets: Record<string, string> = {};
  let clock = 1_700_000_000_000;

  const host: FakeHost = {
    paths,
    workspaceId: 'global',
    workspacePath: root,
    runs,
    replies,
    secrets,

    async readState() {
      return (await readState(paths.stateFile)) ?? structuredClone(DEFAULT_STATE);
    },
    async updateState(updater) {
      await mutateState(paths.stateFile, updater);
    },
    async runModel(params: ModelRunParams): Promise<ModelRunResult> {
      runs.push(params);
      const next = replies.shift();
      if (next === undefined) return { response: '', error: 'No scripted reply.' };
      const response = typeof next === 'function' ? next(params) : next;
      return { response, modelId: 'test-model', providerId: 'test', durationMs: 5 };
    },
    async secret(name) {
      return secrets[name] ?? null;
    },
    now: () => (clock += 1),
    log: () => undefined,

    async state() {
      return (await readState(paths.stateFile)) ?? structuredClone(DEFAULT_STATE);
    },
  };

  return host;
}

export const LIBRARIAN_REPLY = JSON.stringify({
  title: 'Quiet ledger',
  primaryStyle: 'Editorial dashboard',
  designTypes: ['dashboard'],
  tags: ['quiet', 'dense', 'grid', 'editorial'],
  summary: 'A calm dense ledger layout.',
  designIntent: 'Make numbers legible without decoration.',
  aestheticVocabulary: [{ term: 'ledger', meaning: 'ruled rows' }],
  visualProfile: {
    colour: ['near-black ground'],
    typography: ['tight grotesque'],
    layout: ['12 column'],
    spacingAndDensity: ['dense'],
    shapeLanguage: ['square'],
    surfaces: ['flat'],
    imagery: ['none'],
    motion: ['none'],
  },
  palette: [{ hex: '#101014', role: 'background' }],
  always: ['keep contrast high'],
  never: ['use rounded corners'],
  generationPrompt: 'Build a dense editorial dashboard with high contrast and square geometry.',
  confidence: 0.8,
});

export function generationReply(options: {
  title?: string;
  gapDefault?: number;
  extraControls?: unknown[];
} = {}): string {
  return JSON.stringify({
    title: options.title ?? 'Ledger board',
    files: [
      { path: 'body.html', contents: '<main class="board">Ledger</main>' },
      {
        path: 'styles.css',
        contents: `:root { --page-gap: ${options.gapDefault ?? 2}rem; --accent: #3355ff; }\n.board { gap: var(--page-gap); color: var(--accent); }`,
      },
      { path: 'app.js', contents: '' },
    ],
    tweaks: {
      controls: [
        {
          id: 'page-gap',
          group: 'Rhythm',
          label: 'Page gap',
          cssVariable: '--page-gap',
          control: { type: 'range', min: 0, max: 6, step: 0.5, unit: 'rem' },
          defaultValue: options.gapDefault ?? 2,
        },
        {
          id: 'accent',
          group: 'Colour',
          label: 'Accent',
          cssVariable: '--accent',
          control: { type: 'colour' },
          defaultValue: '#3355ff',
        },
        ...(options.extraControls ?? []),
      ],
    },
  });
}
