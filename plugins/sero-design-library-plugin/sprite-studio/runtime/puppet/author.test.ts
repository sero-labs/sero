/**
 * The authoring loop, with a scripted author instead of a model. The fake
 * drives the same tools a real run gets, so what is proven is the loop's own
 * mechanics: feedback text per stage, images on a green bake, the bake
 * budget, the transcript on disk, and an outcome measured by the runtime
 * rather than declared by the author.
 */
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
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

function makeContext(script: Script, judgeScript?: Script): PuppetAuthorContext {
  const host = {
    subagents: {
      async runStructured(params: AppRuntimeSubagentRunParams) {
        const tools = new Map(
          (params.customTools as FakeTool[]).map((tool) => [tool.name, tool]),
        );
        // The judge is a second, separate session; it is told apart by the
        // tools it is given, which is exactly how the real one is separate.
        const runner = tools.has('puppet_judge_score') ? judgeScript : script;
        await runner?.(tools, params);
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

/** A reference already on disk, so no picture is ever bought in a test. */
async function plantReference(runId: string, provider: { calls: number }): Promise<void> {
  const dir = path.join(puppetRunDir(paths, runId), 'reference');
  await mkdir(dir, { recursive: true });
  const { encodeIndexedPng } = await import('../png');
  const cells = new Int16Array(60 * 100);
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 60; x++) {
      cells[y * 60 + x] = x >= 20 && x < 40 && y >= 8 && y < 92 ? 1 : 0;
    }
  }
  await (await import('node:fs/promises')).writeFile(
    path.join(dir, 'side.png'),
    encodeIndexedPng(cells, 60, 100, [
      [240, 240, 240],
      [90, 110, 140],
    ]),
  );
  provider.calls = 0;
}

function stubProvider(): { calls: number } & Record<string, unknown> {
  const state = { calls: 0 };
  return {
    ...state,
    id: 'stub',
    displayName: 'Stub',
    capabilities: () => ['image-to-image'],
    defaultModel: () => 'stub',
    async generate() {
      state.calls++;
      throw new Error('a test must never buy a picture');
    },
  } as never;
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

      await tools.get('puppet_studio_finish')!.execute('t3', {
        seen: 'A small blue round creature waving one arm.',
        note: 'Pip stands and waves.',
      });
    });

    const outcome = await runPuppetAuthor({ runId: 'run-1', brief: 'A small blue blob who waves.' }, context);
    if (outcome.status !== 'converged') throw new Error(`expected converged, got ${outcome.status}`);
    expect(outcome.bakes).toBe(2);
    expect(outcome.note).toBe('A small blue round creature waving one arm. — Pip stands and waves.');

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
      await tools.get('puppet_studio_finish')!.execute('t3', { seen: 'Unclear.', note: 'Out of budget.' });
    });

    const outcome = await runPuppetAuthor(
      { runId: 'run-2', brief: 'Anything.', maxBakes: 1 },
      context,
    );
    if (outcome.status !== 'capped') throw new Error(`expected capped, got ${outcome.status}`);
    expect(outcome.bakes).toBe(1);
    expect(outcome.cleanHash).toBeNull();
  });

  it('a completed run id is refused; a crashed claim is reclaimable', async () => {
    const idle = makeContext(async () => undefined);
    // A claim without a run.json — a run that crashed mid-flight — is taken
    // over by the replay instead of burning the id.
    await mkdir(path.join(puppetRunDir(paths, 'run-dup'), 'rounds'), { recursive: true });
    const reclaimed = await runPuppetAuthor({ runId: 'run-dup', brief: 'Anything.' }, idle);
    expect(reclaimed.status).toBe('failed'); // the idle script never writes — but the claim was honoured
    const second = await runPuppetAuthor({ runId: 'run-dup', brief: 'Anything.' }, idle);
    if (second.status !== 'failed') throw new Error(`expected failed, got ${second.status}`);
    expect(second.reason).toContain('already completed');
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
  it('a green bake the judge fails is NOT converged, and the verdict comes back', async () => {
    // The whole point of Phase 1b. Before it, allClean WAS the finish line and
    // a character nobody could identify counted as a converged run.
    const provider = stubProvider();
    await plantReference('run-aim', provider);
    let feedback = '';
    const context = makeContext(
      async (tools, params) => {
        expect(params.repair?.validate('')).toContain('not looked at the target');
        await tools.get('puppet_studio_show_target')!.execute('t0', {});
        const clean = await tools.get('puppet_studio_write_character')!.execute('t1', { source: CLEAN_SOURCE });
        feedback = clean.content.map((item) => item.text ?? '').join('\n');
        await tools.get('puppet_studio_finish')!.execute('t2', { seen: 'a blob', note: 'stopped' });
      },
      async (tools) => {
        await tools.get('puppet_judge_show')!.execute('j0', {});
        await tools.get('puppet_judge_score')!.execute('j1', {
          seen: 'a featureless blue lozenge',
          silhouette: 1,
          proportions: 1,
          head: 0,
          equipment: 0,
          colour: 2,
          missing: 'there is no head',
        });
      },
    );
    context.provider = provider as never;

    const outcome = await runPuppetAuthor(
      { runId: 'run-aim', brief: 'A knight.', reference: { file: 'ignored.png' } },
      context,
    );
    if (outcome.status !== 'capped') throw new Error(`expected capped, got ${outcome.status}`);
    expect(feedback).toContain('The judge did not pass it');
    expect(feedback).toContain('there is no head');
    expect(provider.calls).toBe(0);

    const run = JSON.parse(await readFile(path.join(puppetRunDir(paths, 'run-aim'), 'run.json'), 'utf8'));
    expect(run.aimed).toBe(true);
    expect(run.verdicts).toHaveLength(1);
    expect(run.verdicts[0].passed).toBe(false);
  });

  it('a green bake the judge passes converges', async () => {
    const provider = stubProvider();
    await plantReference('run-pass', provider);
    const context = makeContext(
      async (tools) => {
        await tools.get('puppet_studio_show_target')!.execute('t0', {});
        await tools.get('puppet_studio_write_character')!.execute('t1', { source: CLEAN_SOURCE });
        await tools.get('puppet_studio_finish')!.execute('t2', { seen: 'a knight', note: 'done' });
      },
      async (tools) => {
        await tools.get('puppet_judge_show')!.execute('j0', {});
        await tools.get('puppet_judge_score')!.execute('j1', {
          seen: 'an armoured figure with a sword',
          silhouette: 2,
          proportions: 2,
          head: 2,
          equipment: 2,
          colour: 2,
          missing: 'the visor could be brighter',
        });
      },
    );
    context.provider = provider as never;
    const outcome = await runPuppetAuthor(
      { runId: 'run-pass', brief: 'A knight.', reference: { file: 'ignored.png' } },
      context,
    );
    expect(outcome.status).toBe('converged');
  });

  it('an unreachable judge is not a pass', async () => {
    // "The check found nothing" and "the check never ran" must not arrive
    // looking alike; a whole animation was once presented as checked that way.
    const provider = stubProvider();
    await plantReference('run-nojudge', provider);
    let feedback = '';
    const context = makeContext(
      async (tools) => {
        await tools.get('puppet_studio_show_target')!.execute('t0', {});
        const clean = await tools.get('puppet_studio_write_character')!.execute('t1', { source: CLEAN_SOURCE });
        feedback = clean.content.map((item) => item.text ?? '').join('\n');
        await tools.get('puppet_studio_finish')!.execute('t2', { seen: 'a blob', note: 'stopped' });
      },
      async () => undefined, // the judge session never looks and never scores
    );
    context.provider = provider as never;
    const outcome = await runPuppetAuthor(
      { runId: 'run-nojudge', brief: 'A knight.', reference: { file: 'ignored.png' } },
      context,
    );
    expect(outcome.status).toBe('capped');
    expect(feedback).toContain('NOT judged');
    const run = JSON.parse(await readFile(path.join(puppetRunDir(paths, 'run-nojudge'), 'run.json'), 'utf8'));
    expect(run.judgeUnavailable).toContain('never looked');
  });
});