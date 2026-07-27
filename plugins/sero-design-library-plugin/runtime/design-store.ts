import { readdir, rm } from 'node:fs/promises';

import type { DesignRecord, DesignVariant } from '../shared/design';
import { normalizeDesignRecord } from '../shared/design-normalize';
import type { DesignLibraryPaths } from '../shared/paths';
import { designDir, designRecordFile, revisionDir, variantDir } from '../shared/paths';
import { readJsonFile, updateState, withRecordLock, writeJsonFile } from '../shared/state-io';
import { projectDesign } from './projection';

/**
 * Design record storage.
 *
 * The same contract as `store.ts` gives items, for the same reasons: only the
 * runtime writes here, every write is followed by a projection into reactive
 * state, and the public wrappers take the record lock while the private core
 * assumes it is already held. Calling a wrapper from inside another deadlocks —
 * the lock is not reentrant.
 */

export async function readDesign(
  paths: DesignLibraryPaths,
  designId: string,
): Promise<DesignRecord | null> {
  return normalizeDesignRecord(await readJsonFile<unknown>(designRecordFile(paths, designId)));
}

export async function listDesignIds(paths: DesignLibraryPaths): Promise<string[]> {
  const entries = await readdir(paths.designsDir, { withFileTypes: true }).catch(() => []);
  return entries.flatMap((entry) => (entry.isDirectory() ? [entry.name] : []));
}

export interface DesignScan {
  designs: DesignRecord[];
  /** Directories holding a record this version cannot read. Files are left alone. */
  unreadable: string[];
}

export async function scanDesigns(paths: DesignLibraryPaths): Promise<DesignScan> {
  const ids = await listDesignIds(paths);
  const designs: DesignRecord[] = [];
  const unreadable: string[] = [];

  for (const id of ids) {
    const record = await readDesign(paths, id);
    if (record) designs.push(record);
    else unreadable.push(id);
  }
  return { designs, unreadable };
}

/** Assumes the caller holds the design's record lock. */
async function writeDesign(
  paths: DesignLibraryPaths,
  design: DesignRecord,
): Promise<DesignRecord> {
  const next: DesignRecord = { ...design, updatedAt: Date.now() };
  await writeJsonFile(designRecordFile(paths, next.id), next);
  const summary = projectDesign(next);
  await updateState(paths, (current) => ({
    ...current,
    designs: [...current.designs.filter((entry) => entry.id !== next.id), summary],
  }));
  return next;
}

export async function saveDesign(paths: DesignLibraryPaths, design: DesignRecord): Promise<void> {
  await withRecordLock(paths, designRecordFile(paths, design.id), async () => {
    await writeDesign(paths, design);
  });
}

/**
 * Write a Design only if that id is free, and hand back whatever is there.
 *
 * Request application is at-least-once: a crash between applying a request and
 * recording it replays that request. A plain save would then write a brand-new
 * record — new variant ids, no revisions — straight over a Design that had
 * already generated, and every completed variant would be gone with no error
 * anywhere. Creating is therefore the one write that must not overwrite.
 */
export async function createDesignRecord(
  paths: DesignLibraryPaths,
  design: DesignRecord,
): Promise<{ design: DesignRecord; created: boolean }> {
  return withRecordLock(paths, designRecordFile(paths, design.id), async () => {
    const existing = await readDesign(paths, design.id);
    if (existing) return { design: existing, created: false };
    return { design: await writeDesign(paths, design), created: true };
  });
}

/**
 * Read, transform and save one Design under a single lock. Returns null when the
 * Design is gone or the transform declined, so a request naming a deleted Design
 * is a no-op rather than an error.
 */
export async function mutateDesign(
  paths: DesignLibraryPaths,
  designId: string,
  mutate: (design: DesignRecord) => DesignRecord | null,
): Promise<DesignRecord | null> {
  return withRecordLock(paths, designRecordFile(paths, designId), async () => {
    const current = await readDesign(paths, designId);
    if (!current) return null;
    const next = mutate(current);
    if (!next) return null;
    return writeDesign(paths, next);
  });
}

/**
 * Transform one variant in place, leaving the rest of the Design untouched.
 *
 * Variants fail, retry and complete independently (spec §6.4), and they all live
 * in one record — so every variant write is a read-modify-write of the whole
 * Design. Routing them through here is what keeps two variants finishing at the
 * same moment from dropping each other's result.
 */
export async function mutateVariant(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  mutate: (variant: DesignVariant, design: DesignRecord) => DesignVariant | null,
): Promise<DesignRecord | null> {
  return mutateDesign(paths, designId, (design) => {
    const current = design.variants.find((variant) => variant.id === variantId);
    if (!current) return null;
    const next = mutate(current, design);
    if (!next) return null;
    return {
      ...design,
      variants: design.variants.map((variant) => (variant.id === variantId ? next : variant)),
    };
  });
}

/** Permanent deletion of a Design and everything generated under it. */
export async function destroyDesign(paths: DesignLibraryPaths, designId: string): Promise<void> {
  await withRecordLock(paths, designRecordFile(paths, designId), async () => {
    await rm(designDir(paths, designId), { recursive: true, force: true });
    await updateState(paths, (current) => ({
      ...current,
      designs: current.designs.filter((entry) => entry.id !== designId),
    }));
  });
}

/**
 * Remove revision directories the record does not mention.
 *
 * A revision's files are written before the record entry that names them, so a
 * crash in between leaves a complete directory nothing points at. It is dead
 * weight, not data: the variant is reconciled back into a resumable state and
 * generates a fresh revision. Best-effort, and it never touches a directory a
 * live revision claims.
 */
export async function pruneOrphanRevisions(
  paths: DesignLibraryPaths,
  design: DesignRecord,
): Promise<number> {
  let removed = 0;
  for (const variant of design.variants) {
    const known = new Set(variant.revisions.map((revision) => revision.id));
    const entries = await readdir(variantDir(paths, design.id, variant.id), {
      withFileTypes: true,
    }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || known.has(entry.name)) continue;
      await rm(revisionDir(paths, design.id, variant.id, entry.name), {
        recursive: true,
        force: true,
      });
      removed += 1;
    }
  }
  return removed;
}
