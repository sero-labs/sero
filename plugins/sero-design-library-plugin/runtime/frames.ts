import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { currentAttempt } from '../shared/media';
import type { DesignLibraryPaths } from '../shared/paths';
import { designAssetDir, itemDir } from '../shared/paths';
import type { LibraryRequestBody } from '../shared/requests';
import { assembleUpload, discardUpload, readUploadManifest } from '../shared/uploads';
import { mutateDesign, readDesign } from './design-store';
import { mutateItem, readItem } from './store';

/**
 * Attaching frames the renderer captured from a video (D4).
 *
 * Video is decoded in the renderer because the runtime has no codecs and no
 * image library, and putting either in the background process for the sake of a
 * thumbnail is the wrong trade. A clip therefore finishes with nothing to paint
 * and nothing the Librarian can look at, and stays that way until an open app
 * notices and does the work.
 *
 * Two things come back: a poster, which is the thumbnail, and a filmstrip —
 * several moments side by side in one image — which is what the Librarian is
 * shown, because it cannot watch a video.
 */

const POSTER_FILE = 'poster.webp';
const FRAMES_FILE = 'frames.webp';

export type FramesTarget = Extract<LibraryRequestBody, { kind: 'frames.attach' }>['target'];

export interface FramesOutcome {
  /** The item that now has frames and can be analysed, if this was an item. */
  analyse?: string;
}

/**
 * Apply one `frames.attach`.
 *
 * The upload is discarded whatever happens, including on a target that has gone
 * away: the staging directory is scratch, and an upload nothing will ever
 * consume is a leak the startup prune only reaches after it has aged out.
 */
export async function attachFrames(
  paths: DesignLibraryPaths,
  body: Extract<LibraryRequestBody, { kind: 'frames.attach' }>,
): Promise<FramesOutcome> {
  const manifest = await readUploadManifest(paths, body.uploadId);
  // Not an error: the request log is at-least-once, so a second application
  // finds the upload already consumed and has nothing left to do.
  if (!manifest?.complete) return {};

  try {
    const [poster, filmstrip] = await Promise.all([
      assembleUpload(paths, body.uploadId, 'preview'),
      assembleUpload(paths, body.uploadId, 'frames'),
    ]);
    if (poster === null) return {};

    return body.target.kind === 'item'
      ? await attachToItem(paths, body.target.itemId, poster, filmstrip)
      : await attachToAsset(paths, body.target.designId, body.target.assetId, poster);
  } finally {
    await discardUpload(paths, body.uploadId);
  }
}

async function attachToItem(
  paths: DesignLibraryPaths,
  itemId: string,
  poster: Buffer,
  filmstrip: Buffer | null,
): Promise<FramesOutcome> {
  // Checked before anything is written. Writing first would create a directory
  // and two files for an item that has been purged since the capture started,
  // and nothing would ever collect them.
  if (!(await readItem(paths, itemId))) return {};

  const directory = itemDir(paths, itemId);
  await mkdir(directory, { recursive: true });
  // Files first, then the record naming them — the same order every other write
  // here uses, so a crash between the two leaves an unreferenced file rather
  // than a record pointing at one that does not exist.
  await writeFile(path.join(directory, POSTER_FILE), poster);
  if (filmstrip !== null) await writeFile(path.join(directory, FRAMES_FILE), filmstrip);

  const updated = await mutateItem(paths, itemId, (item) => ({
    ...item,
    asset: {
      ...item.asset,
      previewFile: POSTER_FILE,
      ...(filmstrip === null ? {} : { framesFile: FRAMES_FILE }),
    },
    awaitingFrames: undefined,
  }));
  if (!updated) return {};

  // Analysis was held back while there was nothing to look at, so this is where
  // a generated video finally gets read.
  return { analyse: itemId };
}

/**
 * A tray asset only needs the poster.
 *
 * Nothing analyses a Design asset — the tray paints it and the build inlines the
 * clip itself — so a filmstrip would be bytes on disk with no reader.
 */
async function attachToAsset(
  paths: DesignLibraryPaths,
  designId: string,
  assetId: string,
  poster: Buffer,
): Promise<FramesOutcome> {
  // Same order as the item path, and for the same reason: an asset deleted or
  // retried since the capture started has nothing this poster belongs to.
  const design = await readDesign(paths, designId);
  const existing = design?.assets.find((entry) => entry.id === assetId);
  if (!existing || currentAttempt(existing)?.outcome !== 'ready') return {};

  const directory = designAssetDir(paths, designId, assetId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, POSTER_FILE), poster);

  await mutateDesign(paths, designId, (design) => {
    const asset = design.assets.find((entry) => entry.id === assetId);
    const attempt = asset === undefined ? undefined : currentAttempt(asset);
    if (!asset || attempt?.outcome !== 'ready') return null;

    // The poster lands on the attempt the frames were taken from, not on the
    // asset: a retry produces different footage, and a poster that outlived its
    // attempt would show the previous clip under the new one.
    return {
      ...design,
      assets: design.assets.map((entry) =>
        entry.id !== assetId
          ? entry
          : {
              ...entry,
              attempts: entry.attempts.map((candidate) =>
                candidate.id === attempt.id ? { ...candidate, posterFile: POSTER_FILE } : candidate,
              ),
              updatedAt: Date.now(),
            },
      ),
    };
  });
  return {};
}
