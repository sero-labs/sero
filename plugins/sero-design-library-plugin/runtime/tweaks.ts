import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { DesignRevision, RevisionTweakState } from '../shared/design';
import { MAX_TWEAK_CHECKPOINTS } from '../shared/design';
import type { DesignLibraryPaths } from '../shared/paths';
import { revisionDir } from '../shared/paths';
import { readJsonFile } from '../shared/state-io';
import type { TweakManifestDocument, TweakOverrides } from '../shared/tweaks';
import {
  EMPTY_MANIFEST_DOCUMENT,
  TWEAK_MANIFEST_FILE,
  normalizeTweakDocument,
  normalizeTweakValue,
  pruneOverrides,
} from '../shared/tweaks';
import { mutateVariant } from './design-store';

/**
 * Writing tweak state (spec §6.5, §6.7).
 *
 * Two things make this more than a setter. First, the value is checked against
 * the revision's own manifest here, in the runtime — the UI validating it is a
 * convenience, but requests arrive through a file, and a value no control
 * declared would otherwise be stored and then sent to the page. Second, the
 * checkpoint rule: autosave writes on every change, while a checkpoint is
 * appended only at the moments that end an editing session, which is what keeps
 * one slider drag from becoming forty entries in history.
 */

export interface TweakTarget {
  designId: string;
  variantId: string;
  revisionId: string;
}

export async function readTweakDocument(
  paths: DesignLibraryPaths,
  target: TweakTarget,
): Promise<TweakManifestDocument> {
  const file = path.join(
    revisionDir(paths, target.designId, target.variantId, target.revisionId),
    TWEAK_MANIFEST_FILE,
  );
  const raw = await readJsonFile<unknown>(file);
  return raw === null ? EMPTY_MANIFEST_DOCUMENT : normalizeTweakDocument(raw);
}

function stateOf(revision: DesignRevision): RevisionTweakState {
  return revision.tweaks ?? { overrides: {}, checkpoints: [] };
}

/**
 * Apply a change to one revision's tweak state.
 *
 * Addressed by revision id rather than "the visible one": a value set while a
 * revision was on screen must land on that revision even if the visible pointer
 * moved between the change and the write — otherwise a slider dragged as a new
 * revision arrives would silently retune the new page.
 */
async function mutateTweaks(
  paths: DesignLibraryPaths,
  target: TweakTarget,
  mutate: (state: RevisionTweakState) => RevisionTweakState | null,
): Promise<void> {
  await mutateVariant(paths, target.designId, target.variantId, (variant) => {
    const revision = variant.revisions.find((entry) => entry.id === target.revisionId);
    if (!revision) return null;
    const next = mutate(stateOf(revision));
    if (next === null) return null;
    return {
      ...variant,
      revisions: variant.revisions.map((entry) =>
        entry.id === target.revisionId ? { ...entry, tweaks: next } : entry,
      ),
    };
  });
}

export async function setTweak(
  paths: DesignLibraryPaths,
  target: TweakTarget,
  controlId: string,
  value: unknown,
): Promise<void> {
  const { manifest } = await readTweakDocument(paths, target);
  const definition = manifest.controls.find((control) => control.id === controlId);
  // A control this revision does not declare is not an error worth surfacing —
  // a manifest can be replaced by a revise while a panel is still open — but it
  // is never stored.
  if (!definition) return;
  const normalized = normalizeTweakValue(definition.control, value);
  if (normalized === null) return;

  await mutateTweaks(paths, target, (state) => ({
    ...state,
    overrides: { ...state.overrides, [controlId]: normalized },
  }));
}

export async function resetTweak(
  paths: DesignLibraryPaths,
  target: TweakTarget,
  controlId: string,
): Promise<void> {
  await mutateTweaks(paths, target, (state) => {
    if (state.overrides[controlId] === undefined) return null;
    const overrides: TweakOverrides = { ...state.overrides };
    delete overrides[controlId];
    return { ...state, overrides };
  });
}

/** Reset all: the defaults come back, and the session is still recoverable. */
export async function resetAllTweaks(
  paths: DesignLibraryPaths,
  target: TweakTarget,
): Promise<void> {
  const { manifest } = await readTweakDocument(paths, target);
  await mutateTweaks(paths, target, (state) => {
    if (Object.keys(state.overrides).length === 0) return null;
    // Checkpointed first, or Reset all would be the one action in the panel that
    // cannot be undone.
    return {
      overrides: {},
      checkpoints: appendCheckpoint(state.checkpoints, pruneOverrides(manifest, state.overrides)),
    };
  });
}

/**
 * End an editing session (spec §6.5): the panel closing, the variant changing, a
 * new revision arriving, a Gallery save, or shutdown.
 *
 * A checkpoint identical to the last one is not appended. Sessions end far more
 * often than values change — every tab switch ends one — and an unchanged entry
 * would fill the history with moments in which nothing happened.
 */
export async function checkpointTweaks(
  paths: DesignLibraryPaths,
  target: TweakTarget,
): Promise<void> {
  await mutateTweaks(paths, target, (state) => {
    if (Object.keys(state.overrides).length === 0 && state.checkpoints.length === 0) return null;
    const checkpoints = appendCheckpoint(state.checkpoints, state.overrides);
    return checkpoints === state.checkpoints ? null : { ...state, checkpoints };
  });
}

/**
 * Put an earlier session's values back. The current ones are checkpointed first.
 *
 * `requestId` names the checkpoint that keeps rather than a fresh id, because
 * requests are applied at-least-once: a crash between applying this one and
 * recording it replays it, and a random id would append the same values again
 * every time — turning one undo into a history that grows on its own. With the
 * request's own id the replay finds its checkpoint already there and stops.
 */
export async function restoreTweakCheckpoint(
  paths: DesignLibraryPaths,
  target: TweakTarget,
  checkpointId: string,
  requestId?: number,
): Promise<void> {
  const marker = requestId === undefined ? null : `request-${requestId}`;
  await mutateTweaks(paths, target, (state) => {
    const checkpoint = state.checkpoints.find((entry) => entry.id === checkpointId);
    if (!checkpoint) return null;
    // The marker decides a replay on its own. Deciding it from the values would
    // be wrong in the case that matters: a restore over values that happen to
    // match the newest checkpoint writes no marker, and the replay then sees a
    // history it can add to again.
    if (marker !== null && state.checkpoints.some((entry) => entry.id === marker)) return null;
    if (sameOverrides(state.overrides, checkpoint.overrides)) return null;
    // The displaced values are always kept, marker or not: undoing an undo is
    // the whole reason this is recoverable.
    return {
      overrides: { ...checkpoint.overrides },
      checkpoints: [
        ...state.checkpoints,
        { id: marker ?? randomUUID(), at: Date.now(), overrides: { ...state.overrides } },
      ].slice(-MAX_TWEAK_CHECKPOINTS),
    };
  });
}

/**
 * The same list when the values are already the newest entry, so a session that
 * ended with nothing new in it writes nothing. Sessions end far more often than
 * values change — every tab switch ends one.
 */
function appendCheckpoint(
  checkpoints: RevisionTweakState['checkpoints'],
  overrides: TweakOverrides,
): RevisionTweakState['checkpoints'] {
  const last = checkpoints[checkpoints.length - 1];
  if (last && sameOverrides(last.overrides, overrides)) return checkpoints;
  return [...checkpoints, { id: randomUUID(), at: Date.now(), overrides: { ...overrides } }].slice(
    -MAX_TWEAK_CHECKPOINTS,
  );
}

function sameOverrides(a: TweakOverrides, b: TweakOverrides): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
