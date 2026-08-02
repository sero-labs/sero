/**
 * The authoring loop, with a scripted author instead of a model. The fake
 * drives the same tools a real run gets, so what is proven is the loop's own
 * mechanics: feedback text per stage, images on a green bake, the bake
 * budget, the transcript on disk, and an outcome measured by the runtime
 * rather than declared by the author.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../../shared/paths';
import { EMPTY_MODEL_SELECTION } from '../../../shared/settings';
import { puppetRunDir } from '../../shared/paths';
import { runPuppetAuthor, type PuppetAuthorContext } from './author';
import { CLEAN_SOURCE, SYNTAX_ERROR_SOURCE } from './fixtures';

interface FakeTool {
  name: string;
  execute(id: string, params: unknown): Promise<{ content: { type: string; text?: string }[] }>;
}

type Script = (tools: Map<string, FakeTool>, params: AppRuntimeSubagentRunParams) => Promise<void>;

let home = '';
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'puppet-author-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function makeContext(script: Script): PuppetAuthorContext {
  const host = {
    subagents: {
      async runStructured(params: AppRuntimeSubagentRunParams) {
        const tools = new Map(
          (params.customTools as FakeTool[]).map((tool) => [tool.name, tool]),
        );
        await script(tools, params);
        return { response: 'done' };
      },
    },
  } as unknown as AppRuntimeHost;
  return {
    host,
    paths,
    workspaceId: 'ws',
    parentSessionId: 'session',
    model: EMPTY_MODEL_SELECTION,
    signal: new AbortController().signal,
  };
}

describe('runPuppetAuthor', () => {
  it('converges: broken bake fed back, clean bake carries images, transcript lands', async () => {
    const seen: string[] = [];
    const context = makeContext(async (tools, params) => {
      const write = tools.get('puppet_studio_write_character')!;
      expect(params.systemPrompt).toContain('# Ink & Bones — authoring a character');
      expect(params.platformTools).toBe('none');

      const broken = await write.execute('t1', { source: SYNTAX_ERROR_SOURCE });
      seen.push(broken.content[0].text ?? '');
      expect(broken.content[0].text).toContain('did not compile');

      const clean = await write.execute('t2', { source: CLEAN_SOURCE });
      seen.push(clean.content[0].text ?? '');
      expect(clean.content[0].text).toContain('Every audit gate is green');
      expect(clean.content.some((item) => item.type === 'image')).toBe(true);
      // Repair pass would not re-prompt now: the run has converged.
      expect(params.repair?.validate('')).toBeNull();

      await tools.get('puppet_studio_finish')!.execute('t3', { note: 'Pip stands and waves.' });
    });

    const outcome = await runPuppetAuthor({ runId: 'run-1', brief: 'A small blue blob who waves.' }, context);
    if (outcome.status !== 'converged') throw new Error(`expected converged, got ${outcome.status}`);
    expect(outcome.bakes).toBe(2);
    expect(outcome.note).toBe('Pip stands and waves.');

    const runDir = puppetRunDir(paths, 'run-1');
    const run = JSON.parse(await readFile(path.join(runDir, 'run.json'), 'utf8'));
    expect(run.outcome.status).toBe('converged');
    expect(run.rounds).toHaveLength(2);
    expect(run.rounds[0].outcome).toBe('compile');
    expect(run.rounds[1].outcome).toBe('clean');
    const round1 = await readFile(path.join(runDir, 'rounds', '1', 'source.ts'), 'utf8');
    expect(round1).toBe(SYNTAX_ERROR_SOURCE);
    const round2 = JSON.parse(await readFile(path.join(runDir, 'rounds', '2', 'round.json'), 'utf8'));
    expect(round2.outcome).toBe('clean');
  });

  it('enforces the bake budget and ends capped without a clean bake', async () => {
    const context = makeContext(async (tools, params) => {
      const write = tools.get('puppet_studio_write_character')!;
      await write.execute('t1', { source: SYNTAX_ERROR_SOURCE });
      // Budget of one: the second write must be refused, not baked.
      const refused = await write.execute('t2', { source: CLEAN_SOURCE });
      expect(refused.content[0].text).toContain('budget');
      // The repair pass would tell the author to finish rather than continue.
      expect(params.repair?.validate('')).toBeNull();
      await tools.get('puppet_studio_finish')!.execute('t3', { note: 'Out of budget.' });
    });

    const outcome = await runPuppetAuthor(
      { runId: 'run-2', brief: 'Anything.', maxBakes: 1 },
      context,
    );
    if (outcome.status !== 'capped') throw new Error(`expected capped, got ${outcome.status}`);
    expect(outcome.bakes).toBe(1);
    expect(outcome.cleanHash).toBeNull();
  });

  it('a run that never writes fails, and the repair pass would have re-prompted', async () => {
    let validateMessage: string | null = null;
    const context = makeContext(async (_tools, params) => {
      validateMessage = params.repair?.validate('') ?? null;
    });

    const outcome = await runPuppetAuthor({ runId: 'run-3', brief: 'Anything.' }, context);
    expect(outcome.status).toBe('failed');
    expect(validateMessage).toContain('not written the character');
  });
});
