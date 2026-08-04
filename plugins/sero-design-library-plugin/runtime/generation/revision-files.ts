import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DesignRecord,
  DesignRevision,
  DesignVariant,
  PendingRevision,
} from '../../shared/design';
import type { DesignLibraryPaths } from '../../shared/paths';
import { revisionDir } from '../../shared/paths';
import type { EmittedFile } from '../../shared/targets';
import type { TweakManifestDocument } from '../../shared/tweaks';
import { TWEAK_MANIFEST_FILE } from '../../shared/tweaks';
import type { TweakValidation } from '../../shared/tweaks-validate';
import type { ModelSelection } from '../../shared/settings';
import { PREVIEW_DOCUMENT_FILE, buildPreviewDocument } from '../build';
import { readDesign } from '../design-store';
import { readAssetBytes } from '../media/assets';

/**
 * Turning what a run produced into a revision on disk.
 *
 * Separated from the queue because it is the half that touches files: the queue
 * decides which run owns a variant and when, and this decides what a finished run
 * leaves behind. The order of the writes here is load-bearing — files before the
 * record entry that names them — and it is stated once, in `storeRevisionFiles`.
 */

export interface RevisionNaming {
  name: string;
  summary: string;
  tweaks: TweakValidation | null;
  model?: ModelSelection;
}

export interface AssembledRevision {
  revision: DesignRevision;
  /** False when nothing renderable came out; the files are still on disk. */
  built: boolean;
}

/**
 * Build the document, write the revision directory, and describe what landed.
 *
 * A revision that did not build is still written and still recorded — the files
 * are what the user reads to see what went wrong — but it carries no `builtFile`,
 * and the caller fails the variant on that. A build warning is a note about a
 * page that works, never a substitute for one that does not (spec §7).
 */
export async function storeRevisionFiles(
  paths: DesignLibraryPaths,
  design: DesignRecord,
  target: { designId: string; variantId: string },
  jobId: string,
  files: EmittedFile[],
  naming: RevisionNaming,
): Promise<AssembledRevision> {
  const revisionId = randomUUID();
  const directory = revisionDir(paths, target.designId, target.variantId, revisionId);

  // The manifest is bound to the revision here rather than in the tool that
  // declared it: the revision id does not exist while the run is going, and a
  // manifest naming one before it was written could outlive what it describes.
  const tweaks: TweakManifestDocument | null =
    naming.tweaks === null
      ? null
      : {
          manifest: { ...naming.tweaks.manifest, variantRevisionId: revisionId },
          dropped: naming.tweaks.dropped,
        };

  // Assets are read back from the record rather than taken from the `design`
  // this function was handed: the run generates media *while* it goes, so the
  // record read before it started names none of what it produced.
  const current = (await readDesign(paths, design.id)) ?? design;

  // The document accepts live values for exactly the properties the manifest
  // declared, and it is built with that list inside it — so the allow-list can
  // never drift from the panel that sends against it.
  const built = await buildPreviewDocument(design.brief.target, files, {
    tweakVariables: tweaks?.manifest.controls.map((control) => control.cssVariable) ?? [],
    assets: await readAssetBytes(paths, current),
  });

  await writeRevisionDirectory(directory, [
    ...files,
    ...(built.document === undefined
      ? []
      : [{ name: PREVIEW_DOCUMENT_FILE, content: built.document }]),
    ...(built.document !== undefined && tweaks !== null
      ? [{ name: TWEAK_MANIFEST_FILE, content: JSON.stringify(tweaks, null, 2) }]
      : []),
  ]);

  return {
    built: built.document !== undefined,
    revision: {
      id: revisionId,
      createdAt: Date.now(),
      jobId,
      ...(naming.model === undefined ? {} : { model: naming.model }),
      files: files.map((file) => ({
        name: file.name,
        bytes: Buffer.byteLength(file.content, 'utf8'),
      })),
      ...(built.document === undefined ? {} : { builtFile: PREVIEW_DOCUMENT_FILE }),
      buildWarnings: built.warnings,
      // Recorded even when every control was dropped: the panel still has
      // something true to say, and "no controls, and here is why" is a better
      // answer than a tab that looks broken.
      ...(built.document === undefined || tweaks === null
        ? {}
        : { tweakManifestFile: TWEAK_MANIFEST_FILE }),
      summary: naming.summary,
      name: naming.name,
    },
  };
}

async function writeRevisionDirectory(directory: string, files: EmittedFile[]): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const file of files) {
    await writeFile(path.join(directory, file.name), file.content, 'utf8');
  }
}

/**
 * The page a revise starts from, or null when there is nothing to revise.
 *
 * The contents come off disk rather than out of the record, which holds only
 * names and sizes. A revision whose files are gone returns null: seeding an empty
 * set would turn the instruction into a fresh generation wearing a revise's name.
 */
export async function readRevisionSource(
  paths: DesignLibraryPaths,
  design: DesignRecord,
  variant: DesignVariant,
): Promise<{ instruction: string; files: EmittedFile[] } | null> {
  const pending = variant.pendingRevision;
  if (pending === undefined) return null;
  const base = variant.revisions.find((entry) => entry.id === pending.baseRevisionId);
  if (!base) return null;

  const directory = revisionDir(paths, design.id, variant.id, pending.baseRevisionId);
  const files: EmittedFile[] = [];
  for (const file of base.files) {
    const content = await readFile(path.join(directory, file.name), 'utf8').catch(() => null);
    if (content !== null) files.push({ name: file.name, content });
  }
  return files.length === 0 ? null : { instruction: pending.instruction, files };
}

/**
 * Mark the revision a `replace` was asked to take the place of (spec §6.4).
 *
 * Nothing is deleted: a superseded revision keeps its files and can be made
 * visible again, which is what makes replacing a result recoverable. `retain`
 * changes nothing here — both revisions stay in the selector.
 */
export function applyRevisionBehaviour(
  revisions: DesignRevision[],
  pending: PendingRevision | undefined,
): DesignRevision[] {
  if (pending === undefined || pending.behaviour !== 'replace') return revisions;
  return revisions.map((revision) =>
    revision.id === pending.baseRevisionId ? { ...revision, supersededAt: Date.now() } : revision,
  );
}
