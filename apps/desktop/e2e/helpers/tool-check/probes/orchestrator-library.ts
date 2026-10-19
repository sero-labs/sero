/**
 * The loop library: saving the manual loop as versions of a library entry,
 * switching between them, loading a copy into the workspace, unlinking and
 * deleting. Also the plan revise the second version is saved from.
 */
import path from 'node:path';
import { expectOk, expectText } from '../expect';
import { fileExists, must, readJson } from './cron-memory-support';
import type { ScenarioStep, StepContext } from '../types';
import {
  expectLoopGone,
  idFromText,
  libraryDir,
  loopIdOf,
  MANUAL_PROMPT,
  readLoop,
  readRevisions,
  saveLoopId,
} from './orchestrator-support';

const manualId = (ctx: StepContext): string => loopIdOf(ctx, 'manual');
const ENTRY_NAME = 'tc-orch library entry';
const REVISE_PROMPT = 'tc-orch-manual: add a step that reviews the note';

interface LibraryIndexFile {
  entries: Array<{ id: string; name: string; latestVersion: number; catalog?: { slug: string; catalogVersion: number } }>;
}

export async function readLibraryIndex(ctx: StepContext): Promise<LibraryIndexFile> {
  return (await readJson<LibraryIndexFile>(path.join(await libraryDir(ctx), 'index.json'))) ?? { entries: [] };
}

function entryId(ctx: StepContext): string {
  const id = ctx.state['orchestrator:libraryEntry'];
  must(typeof id === 'string', 'no library entry id was saved');
  return id;
}

async function versionFile(ctx: StepContext, version: number): Promise<{ definition: { plan: { steps: unknown[] } } } | null> {
  return readJson(path.join(await libraryDir(ctx), 'entries', entryId(ctx), 'versions', `${version}.json`));
}

export const libraryStepsBeforeRevise: ScenarioStep[] = [
  {
    action: 'library_save',
    params: (ctx) => ({ action: 'library_save', loopId: manualId(ctx), mode: 'new-entry', name: ENTRY_NAME, note: 'one step' }),
    async expect(result, ctx) {
      expectText(result, 'Saved loop to the library (now v1)');
      const link = (await readLoop(ctx, manualId(ctx))).libraryLink;
      must(link?.version === 1, `the loop's library link is ${JSON.stringify(link)}`);
      ctx.state['orchestrator:libraryEntry'] = link.entryId;
      const entry = (await readLibraryIndex(ctx)).entries.find((candidate) => candidate.id === link.entryId);
      must(entry?.name === ENTRY_NAME && entry.latestVersion === 1, `the library index holds ${JSON.stringify(entry)}`);
      must((await versionFile(ctx, 1))?.definition.plan.steps.length === 1, 'version 1 does not hold the one-step plan');
    },
  },
  {
    // The model writes the revised plan; the loop keeps its goal, so no trigger run follows.
    action: 'revise',
    params: (ctx) => ({ action: 'revise', loopId: manualId(ctx), prompt: REVISE_PROMPT }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'revise ok');
      const loop = await readLoop(ctx, manualId(ctx));
      must(loop.plan.steps.length === 2 && loop.plan.steps[1]!.id === 'review', `the revised plan is ${JSON.stringify(loop.plan.steps.map((step) => step.id))}`);
      must(loop.prompt === MANUAL_PROMPT, "the revision changed the loop's goal");
      const revisions = await readRevisions(ctx, manualId(ctx));
      must(revisions.some((revision) => revision.status === 'applied' && revision.reason === REVISE_PROMPT), `no applied revision for the request: ${JSON.stringify(revisions)}`);
    },
  },
];

export const libraryStepsAfterRevise: ScenarioStep[] = [
  {
    action: 'library_save',
    params: (ctx) => ({ action: 'library_save', loopId: manualId(ctx), mode: 'new-version', note: 'with a review step' }),
    async expect(result, ctx) {
      expectText(result, 'Saved loop to the library (now v2)');
      must((await readLoop(ctx, manualId(ctx))).libraryLink?.version === 2, 'the loop is not linked to version 2');
      const entry = (await readLibraryIndex(ctx)).entries.find((candidate) => candidate.id === entryId(ctx));
      must(entry?.latestVersion === 2, `the library index holds ${JSON.stringify(entry)}`);
      must((await versionFile(ctx, 2))?.definition.plan.steps.length === 2, 'version 2 does not hold the revised plan');
    },
  },
  {
    action: 'library_list',
    params: { action: 'library_list' },
    async expect(result, ctx) {
      expectOk(result);
      const count = /(\d+) library entr\(ies\)\./.exec(result.text)?.[1];
      const index = await readLibraryIndex(ctx);
      must(count !== undefined && Number(count) === index.entries.length, `library_list said ${result.text}, the index holds ${index.entries.length}`);
      must(index.entries.some((entry) => entry.id === entryId(ctx)), 'the entry is not in the library index');
    },
  },
  {
    // Going back to version 1 swaps the plan for the one-step plan the version holds.
    action: 'library_set_version',
    params: (ctx) => ({ action: 'library_set_version', loopId: manualId(ctx), version: 1 }),
    async expect(result, ctx) {
      expectText(result, `Loop ${manualId(ctx)} switched to library v1.`);
      const loop = await readLoop(ctx, manualId(ctx));
      must(loop.libraryLink?.version === 1 && loop.plan.steps.length === 1, `the loop is on ${JSON.stringify(loop.libraryLink)} with ${loop.plan.steps.length} steps`);
      must(loop.runtime.stepStates.work?.status === 'pending', 'the switched plan kept the old step states');
    },
  },
  {
    // With no version it loads the latest, which is the two-step plan. It lands as a new draft.
    action: 'library_load',
    params: (ctx) => ({ action: 'library_load', entryId: entryId(ctx) }),
    async expect(result, ctx) {
      expectText(result, `Loaded library entry ${entryId(ctx)} into loop `);
      const id = idFromText(result, /into loop (\S+) \(status/);
      saveLoopId(ctx, 'library', id);
      const loop = await readLoop(ctx, id);
      must(loop.status === 'draft' && loop.libraryLink?.entryId === entryId(ctx) && loop.libraryLink.version === 2, `the loaded loop is ${loop.status}, ${JSON.stringify(loop.libraryLink)}`);
      must(loop.plan.steps.length === 2, `the loaded loop has ${loop.plan.steps.length} steps`);
    },
  },
  {
    action: 'library_unlink',
    params: (ctx) => ({ action: 'library_unlink', loopId: manualId(ctx) }),
    async expect(result, ctx) {
      expectText(result, `Loop ${manualId(ctx)} unlinked from the library.`);
      const loop = await readLoop(ctx, manualId(ctx));
      must(!loop.libraryLink && loop.plan.steps.length === 1, 'the unlinked loop kept its link or lost its plan');
    },
  },
  {
    // Deleting the entry leaves the copy that was loaded from it.
    action: 'library_delete',
    params: (ctx) => ({ action: 'library_delete', entryId: entryId(ctx) }),
    async expect(result, ctx) {
      expectText(result, `Deleted library entry ${entryId(ctx)}.`);
      must(!(await readLibraryIndex(ctx)).entries.some((entry) => entry.id === entryId(ctx)), 'the entry is still in the library index');
      must(!(await fileExists(path.join(await libraryDir(ctx), 'entries', entryId(ctx), 'entry.json'))), 'the entry file is still on disk');
      must((await readLoop(ctx, loopIdOf(ctx, 'library'))).status === 'draft', 'deleting the entry removed the loaded loop');
    },
  },
  {
    action: 'delete',
    params: (ctx) => ({ action: 'delete', loopId: loopIdOf(ctx, 'library') }),
    async expect(result, ctx) {
      expectText(result, `Deleted loop ${loopIdOf(ctx, 'library')}.`);
      await expectLoopGone(ctx, loopIdOf(ctx, 'library'));
    },
  },
];
