/**
 * Coordinator-facing handlers for the Loop Library actions
 * (specs/08-loop-library.md). Kept out of coordinator.ts (500-LOC limit); the
 * coordinator delegates the library_* action kinds here.
 *
 *   library_save — publish the loop's definition as a new version of its linked
 *                  entry, or as a new entry (the default for an unlinked loop).
 */

import type { Loop, LoopLibraryLink, OrchestratorAction, OrchestratorActionResult } from '../shared/types';
import type { OrchestratorHost } from './host';
import { buildLibrarySave } from '../shared/library';
import { validateSharedDefinition } from './definition-validation';
import { fileDeliveryPlacement, instantiate } from './library';
import { replayStepOverrides } from './library-overlay';
import { materializeTriggers } from './loop-factory';
import { initStepStates } from './plan-mapping';

export type LibraryAction = Extract<OrchestratorAction, { kind: `library_${string}` }>;

/**
 * Library entry ids are generated as `libentry_<uuid>` and used directly in
 * filesystem paths. The tool surface accepts an arbitrary `entryId`, so reject
 * anything that isn't a plain id before it reaches a path (the store enforces
 * the same containment as a backstop).
 */
const SAFE_ENTRY_ID = /^[A-Za-z0-9_-]+$/;

/** True for every `library_*` action — lets the coordinator route them in one line. */
export function isLibraryAction(action: OrchestratorAction): action is LibraryAction {
  return action.kind.startsWith('library_');
}

async function findLoop(host: OrchestratorHost, loopId: string): Promise<Loop | undefined> {
  const state = await host.readState();
  return state?.loops.find((l) => l.id === loopId);
}

async function replaceLoop(host: OrchestratorHost, loop: Loop): Promise<void> {
  await host.updateState((state) => ({ ...state, loops: state.loops.map((l) => (l.id === loop.id ? loop : l)) }));
}

async function appendLoop(host: OrchestratorHost, loop: Loop): Promise<void> {
  await host.updateState((state) => ({ ...state, loops: [...state.loops, loop] }));
}

async function saveToLibrary(
  host: OrchestratorHost,
  action: Extract<LibraryAction, { kind: 'library_save' }>,
): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, action.loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${action.loopId}` };
  if (loop.plan.steps.length === 0) return { ok: false, error: 'This loop has no plan to save yet.' };

  // new-version bumps the linked entry — but only if it still exists in the
  // store. A new-entry save, an unlinked loop, or a deleted source all start a
  // fresh entry at v1.
  const linked = action.mode === 'new-version' ? loop.libraryLink ?? null : null;
  const existing = linked ? await host.library.readEntry(linked.entryId) : null;
  const entryId = existing?.id ?? host.newId('libentry');
  const now = host.now();

  const { entry, version, link } = buildLibrarySave({
    loop,
    existing,
    entryId,
    name: action.name?.trim() || loop.title,
    note: action.note,
    now,
    savedFromWorkspaceId: host.workspaceId,
  });
  await host.library.putVersion(entry, version);

  const updated: Loop = { ...loop, libraryLink: link, updatedAt: now };
  await replaceLoop(host, updated);
  host.log(`Saved loop ${loop.id} to library entry ${entry.id} v${version.version}`);
  return { ok: true, loop: updated };
}

async function loadFromLibrary(
  host: OrchestratorHost,
  action: Extract<LibraryAction, { kind: 'library_load' }>,
): Promise<OrchestratorActionResult> {
  if (!SAFE_ENTRY_ID.test(action.entryId)) return { ok: false, error: `Invalid library entry id: ${JSON.stringify(action.entryId)}` };
  const entry = await host.library.readEntry(action.entryId);
  if (!entry) return { ok: false, error: `Library entry not found: ${action.entryId}` };
  const versionNumber = action.version ?? entry.latestVersion;
  const version = await host.library.readVersion(entry.id, versionNumber);
  if (!version) return { ok: false, error: `Library version not found: ${entry.id} v${versionNumber}` };

  const link: LoopLibraryLink = { entryId: entry.id, version: versionNumber, syncedAt: host.now() };
  let loop = instantiate(host, version.definition, link);

  // Re-validate the FULL definition on load (plan, delivery + gate shape,
  // triggers): one saved under older rules that no longer validates becomes a
  // blocked draft carrying the errors (it cannot be activated), exactly like a
  // create that fails validation.
  const errors = validateSharedDefinition(version.definition);
  if (errors.length > 0) {
    loop = {
      ...loop,
      summary: 'Loaded definition failed validation.',
      runtime: { ...loop.runtime, block: { kind: 'validation-error', reason: errors.join('; '), createdAt: loop.createdAt } },
    };
  }
  await appendLoop(host, loop);
  host.log(`Loaded library entry ${entry.id} v${versionNumber} into loop ${loop.id}`);
  return { ok: true, loop };
}

/** Returns the resolved library dir so the UI can watch its index.json directly. */
async function listLibrary(host: OrchestratorHost): Promise<OrchestratorActionResult> {
  const [libraryDir, libraryIndex] = await Promise.all([host.library.dir(), host.library.readIndex()]);
  return { ok: true, libraryDir, libraryIndex };
}

/**
 * Update (newer) or downgrade (older) a linked loop to a specific library
 * version. The library owns the WHOLE definition, so the switch applies all of
 * it — plan, prompt, title, summary, triggers, limits, log policy, context
 * overrides, and delivery — not just the plan (a catalog update may change
 * cadence, event source, or destination). Deliberately local and preserved:
 * the loop's identity/history (runs, revisions, insights, answered inputs,
 * warnings), the workspace placement choice (except the file-delivery rule),
 * and the step-override overlay, which is replayed onto the new plan.
 * Triggers are definition-owned: they rematerialize with fresh ids and zeroed
 * counters, replacing local trigger edits (logged).
 */
async function setVersion(
  host: OrchestratorHost,
  action: Extract<LibraryAction, { kind: 'library_set_version' }>,
): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, action.loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${action.loopId}` };
  if (!loop.libraryLink) return { ok: false, error: 'This loop is not linked to a library entry.' };
  if (loop.runtime.activeRunId) return { ok: false, error: 'Finish or stop the current run before switching versions.' };

  const target = await host.library.readVersion(loop.libraryLink.entryId, action.version);
  if (!target) return { ok: false, error: `Library version not found: v${action.version}` };

  // Replay the local step-override overlay onto the target plan, then validate
  // the definition as it will actually run (overlaid plan + target delivery,
  // gate shape, and triggers).
  const def = target.definition;
  const { plan, dropped } = replayStepOverrides(def.plan, loop.stepOverrides);
  const errors = validateSharedDefinition({ ...def, plan });
  if (errors.length > 0) return { ok: false, error: `That version is invalid: ${errors.join('; ')}` };

  const now = host.now();
  const placement = fileDeliveryPlacement(def);
  const next: Loop = {
    ...loop,
    title: def.title,
    prompt: def.prompt,
    summary: def.summary,
    plan,
    triggers: materializeTriggers(host, loop.id, def.triggers),
    limits: { ...def.limits },
    logPolicy: { ...def.logPolicy },
    contextOverrides: def.contextOverrides ? structuredClone(def.contextOverrides) : undefined,
    delivery: def.delivery ? structuredClone(def.delivery) : undefined,
    workspace: placement ? { ...loop.workspace, ...placement } : loop.workspace,
    runtime: { ...loop.runtime, variables: {}, stepStates: initStepStates(plan, now), block: undefined, completion: undefined },
    libraryLink: { ...loop.libraryLink, version: action.version, syncedAt: now },
    updatedAt: now,
  };
  await replaceLoop(host, next);
  if (dropped.length) host.log(`Library switch dropped overrides for missing step(s): ${dropped.join(', ')}`);
  if (loop.triggers.length > 0) host.log(`Library switch replaced ${loop.triggers.length} trigger(s) with the version's definition triggers`);
  if (placement && loop.workspace.useManagedWorktree) host.log(`Loop ${loop.id} moved to the workspace root: v${action.version} delivers files`);
  host.log(`Loop ${loop.id} switched to library v${action.version}`);
  return { ok: true, loop: next };
}

/** Detaches a loop from the library — it keeps its current plan and becomes standalone. */
async function unlinkLibrary(
  host: OrchestratorHost,
  action: Extract<LibraryAction, { kind: 'library_unlink' }>,
): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, action.loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${action.loopId}` };
  if (!loop.libraryLink) return { ok: true, loop };
  const next: Loop = { ...loop, updatedAt: host.now() };
  delete next.libraryLink;
  delete next.stepOverrides; // picks already live in the plan; the overlay is only for replays
  await replaceLoop(host, next);
  return { ok: true, loop: next };
}

/** Removes a library entry and its versions. Never touches loaded loops. */
async function deleteEntry(
  host: OrchestratorHost,
  action: Extract<LibraryAction, { kind: 'library_delete' }>,
): Promise<OrchestratorActionResult> {
  if (!SAFE_ENTRY_ID.test(action.entryId)) return { ok: false, error: `Invalid library entry id: ${JSON.stringify(action.entryId)}` };
  await host.library.deleteEntry(action.entryId);
  host.log(`Deleted library entry ${action.entryId}`);
  return { ok: true };
}

export function handleLibraryAction(host: OrchestratorHost, action: LibraryAction): Promise<OrchestratorActionResult> {
  switch (action.kind) {
    case 'library_save':
      return saveToLibrary(host, action);
    case 'library_load':
      return loadFromLibrary(host, action);
    case 'library_list':
      return listLibrary(host);
    case 'library_set_version':
      return setVersion(host, action);
    case 'library_unlink':
      return unlinkLibrary(host, action);
    case 'library_delete':
      return deleteEntry(host, action);
  }
}
