/**
 * The authoring loop (Ink & Bones plan, Phase 1): a brief in, a converged
 * character file out.
 *
 * One subagent run IS the loop. The write tool bakes on every call and hands
 * back the audits and the pictures, so the author keeps its own reasoning
 * context from round to round instead of being re-briefed each time, and the
 * bake budget inside the tool is the iteration cap. The Library's generation
 * pattern throughout: `platformTools: 'none'`, custom tools as the only
 * channel, a repair pass that re-prompts rather than trusts, and a transcript
 * of every round on disk — this run is the go/no-go evidence (P3).
 */

import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import { API_REFERENCE, AUTHORING_GUIDE, ENGINE_VERSION } from '@sero-ai/ink-and-bones';

import type { DesignLibraryPaths } from '../../../shared/paths';
import type { ModelSelection } from '../../../shared/settings';
import { modelSelectionIsEmpty } from '../../../shared/settings';
import { readState, withRecordLock } from '../../../shared/state-io';
import { puppetLabDir, puppetRunDir } from '../../shared/paths';
import { bakePuppetSource, readReviewPngs } from './bake';
import type { PuppetRound } from './tools';
import { createCharacterSourceTool, createFinishTool, DEFAULT_MAX_BAKES } from './tools';

const RUN_TIMEOUT_MS = 900_000;
const REPAIR_ATTEMPTS = 2;

export interface PuppetAuthorJob {
  runId: string;
  brief: string;
  maxBakes?: number;
}

export interface PuppetAuthorContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
  onProgress?(message: string): void;
}

/** Same-machine liveness probe: signal 0 checks existence without delivering;
 * EPERM means alive under another user. */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export type PuppetAuthorOutcome =
  | { status: 'converged'; bakes: number; hash: string; note: string | null }
  | { status: 'capped'; bakes: number; cleanHash: string | null; note: string | null }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

function buildSystemPrompt(maxBakes: number): string {
  return `You are authoring ONE pixel-art character for the Ink & Bones engine, alone, until it is right.

How this run works:
- puppet_studio_write_character replaces the whole character file, then compiles, bakes and audits it. Its result — compile errors, audit lines, review pictures — is the only feedback that exists. Send the COMPLETE file every time.
- You have ${maxBakes} bakes. Spend them deliberately: change few things per bake, keep what worked. Do not stop early — leftover budget spent on readability is never wasted.
- The audit gates are measurements, not advice. When every gate is green, the real test begins: judge the pictures like a STRANGER who never read the brief. The silhouette alone must name the character; the head must read as a head; every part must be findable in every frame.
- Call puppet_studio_finish only when a stranger would name this character at a glance — its 'seen' field is that test, written down. Do not call it while gates fail unless the budget is spent.

Two documents follow and together they are the whole API — nothing else exists. The guide teaches the craft; the declarations settle the signatures. When the two disagree about an argument, the declarations are the truth, and a call with the wrong argument shape now throws rather than quietly drawing nothing.

${AUTHORING_GUIDE}

# The engine API, as TypeScript declarations

${API_REFERENCE}`;
}

function buildTask(brief: string): string {
  return `Author a character from this brief:

${brief}

Unless the brief demands otherwise: author on a 112 x 144 canvas at 1x — big enough for a helmet, a face mark and carried gear to survive the grade — and give the character at least an 'idle' and a 'run' clip (a west-facing mirror costs one line). The figure should stand about 85% of that canvas height. Start by writing a complete first version — skeleton, rest pose, parts, clips — and bake it.`;
}

/** Run the loop and leave the transcript under `puppet-lab/<runId>/`. */
export async function runPuppetAuthor(
  job: PuppetAuthorJob,
  context: PuppetAuthorContext,
): Promise<PuppetAuthorOutcome> {
  const maxBakes = Math.max(1, Math.min(20, job.maxBakes ?? DEFAULT_MAX_BAKES));
  const runDir = puppetRunDir(context.paths, job.runId);
  // The directory IS the claim, and claim.json names its owner. Request logs
  // replay at-least-once, and two runs sharing an id would interleave one
  // transcript; the rules are: a finished run (run.json present) stays
  // refused, a claim whose owning process still exists stays refused, and
  // only a provably dead owner's claim is reclaimed — with its half-written
  // rounds cleared first so the new transcript is whole. Inspection and
  // takeover happen inside one cross-process lock, so a claimant can never
  // observe another's claim half-made, and two replays cannot reclaim one
  // dead run together. (In-process double starts are already deduplicated
  // at the queue.)
  await mkdir(puppetLabDir(context.paths), { recursive: true });
  const claim = await withRecordLock(context.paths, runDir, async () => {
    const finished = await access(path.join(runDir, 'run.json')).then(
      () => true,
      () => false,
    );
    if (finished) return 'completed';
    const owner = await readFile(path.join(runDir, 'claim.json'), 'utf8')
      .then((raw) => JSON.parse(raw) as { pid?: number })
      .catch(() => null);
    if (typeof owner?.pid === 'number' && owner.pid !== process.pid && processExists(owner.pid)) {
      return 'running';
    }
    // Taking over any pre-existing directory clears its half-written rounds,
    // claim.json or not — the new transcript must be whole.
    await rm(path.join(runDir, 'rounds'), { recursive: true, force: true });
    await mkdir(path.join(runDir, 'rounds'), { recursive: true });
    await writeFile(
      path.join(runDir, 'claim.json'),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      'utf8',
    );
    return 'claimed';
  });
  if (claim === 'completed') {
    return { status: 'failed', reason: `Run '${job.runId}' already completed — every run gets a fresh id.` };
  }
  if (claim === 'running') {
    return { status: 'failed', reason: `Run '${job.runId}' is still running elsewhere.` };
  }
  const startedAt = new Date().toISOString();

  const source = createCharacterSourceTool({
    maxBakes,
    bake: async (text) => {
      if (context.signal.aborted) throw new Error('Aborted');
      context.onProgress?.(`Baking (${source.rounds().length + 1}/${maxBakes})…`);
      const outcome = await bakePuppetSource(context.paths, text, { signal: context.signal });
      // Aborting mid-bake surfaces as a load failure from the worker; a
      // cancelled run must not record it as a round the author took.
      if (context.signal.aborted) throw new Error('Aborted');
      const images = outcome.ok ? await readReviewPngs(outcome.dir, outcome.report) : null;
      if (context.signal.aborted) throw new Error('Aborted');
      return { outcome, images };
    },
    onRound: async (round: PuppetRound, text: string) => {
      // A cancelled run stops leaving marks; what was already written stands.
      if (context.signal.aborted) return;
      const dir = path.join(runDir, 'rounds', String(round.round));
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'source.ts'), text, 'utf8');
      await writeFile(path.join(dir, 'round.json'), JSON.stringify(round, null, 2), 'utf8');
    },
  });
  const finish = createFinishTool();

  const params: AppRuntimeSubagentRunParams = {
    task: buildTask(job.brief),
    systemPrompt: buildSystemPrompt(maxBakes),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    // Authoring is judgement work — spatial reasoning, colour, reading its
    // own pictures. The tier default (low) produced quick sketches; bakes
    // are near-free, so the model's thinking is the quality lever.
    thinking: 'high',
    platformTools: 'none',
    customTools: [source.definition, finish.definition],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    repair: {
      maxAttempts: REPAIR_ATTEMPTS,
      validate: () => {
        if (source.rounds().length === 0) {
          return 'You have not written the character. Call puppet_studio_write_character with the complete file.';
        }
        if (!source.converged() && source.rounds().length < maxBakes && finish.note() === null) {
          return 'The last bake still fails gates and budget remains. Revise the file and bake again, or call puppet_studio_finish to stop here.';
        }
        return null;
      },
    },
    ...(modelSelectionIsEmpty(context.model) ? {} : { model: context.model.modelId }),
  };

  context.onProgress?.('Reading the brief…');
  const result = await context.host.subagents.runStructured(params);

  const rounds = source.rounds();
  const outcome: PuppetAuthorOutcome =
    context.signal.aborted || result.error?.startsWith('Aborted')
      ? { status: 'cancelled' }
      : rounds.length === 0
        ? {
            status: 'failed',
            reason: result.error ?? 'The run ended without ever writing a character.',
          }
        : source.converged()
          ? {
              status: 'converged',
              bakes: rounds.length,
              hash: rounds[rounds.length - 1].hash,
              // The stranger's description first: it is the readability test
              // on the record, beside the author's own summary.
              note: [finish.seen(), finish.note()].filter((part) => part !== null).join(' — ') || null,
            }
          : {
              status: 'capped',
              bakes: rounds.length,
              cleanHash: source.lastCleanHash(),
              note: [finish.seen(), finish.note()].filter((part) => part !== null).join(' — ') || null,
            };

  await writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify(
      {
        runId: job.runId,
        brief: job.brief,
        engineVersion: ENGINE_VERSION,
        maxBakes,
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome,
        rounds,
        // Which model actually authored this run — the question always asked
        // when a result surprises, answerable only if written down.
        ...(result.modelId === undefined ? {} : { modelId: result.modelId }),
        ...(result.providerId === undefined ? {} : { providerId: result.providerId }),
        ...(result.usage === undefined ? {} : { usage: result.usage }),
        ...(result.error === undefined ? {} : { runError: result.error }),
      },
      null,
      2,
    ),
    'utf8',
  );
  return outcome;
}

/** What the queue calls: reads the configured model, runs the loop, and puts
 * the result where the user looks (the notice bar, this phase). */
export interface PuppetJobPort {
  paths: DesignLibraryPaths;
  host: AppRuntimeHost;
  workspaceId: string;
  sessionId: string;
  progress(characterId: string, message: string): Promise<void>;
}

export async function runPuppetAuthorJob(
  runner: PuppetJobPort,
  job: PuppetAuthorJob,
  signal: AbortSignal,
): Promise<void> {
  const state = await readState(runner.paths);
  const outcome = await runPuppetAuthor(job, {
    host: runner.host,
    paths: runner.paths,
    workspaceId: runner.workspaceId,
    parentSessionId: runner.sessionId,
    model: state.settings.designModel,
    signal,
    onProgress: (message) => {
      if (!signal.aborted) void runner.progress(job.runId, message);
    },
  });

  const text =
    outcome.status === 'converged'
      ? `Puppet run ${job.runId}: converged in ${outcome.bakes} bakes.`
      : outcome.status === 'capped'
        ? `Puppet run ${job.runId}: budget spent after ${outcome.bakes} bakes without a clean character.`
        : outcome.status === 'cancelled'
          ? `Puppet run ${job.runId}: cancelled.`
          : `Puppet run ${job.runId} failed: ${outcome.reason}`;
  await runner.progress(job.runId, text);
}
