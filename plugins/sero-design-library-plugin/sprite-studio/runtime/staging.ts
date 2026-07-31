/**
 * Bytes on their way in from the page.
 *
 * Sprite Studio needs a staging area of its own rather than the Library's
 * upload pipeline, and the reason is the video. **The runtime has no codecs**,
 * so a finished clip arrives with nothing to compile from; the open page decodes
 * it and hands back the sampled frames — sixty of them for a five second clip.
 * The Library's uploads carry one file each, which would make that sixty
 * manifests and several hundred tool calls for one animation.
 *
 * So a staging key holds many files, chunked, and the runtime consumes and
 * deletes the directory when it has read them. Staging files are scratch, not
 * records: nothing here survives being applied.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertSafeId, type DesignLibraryPaths } from '../../shared/paths';

/** Chunks are bounded so a large frame cannot arrive as one enormous tool call. */
export const STAGING_CHUNK_BYTES = 512 * 1024;
/** A clip's worth of frames, with room to spare. */
export const MAX_STAGED_BYTES = 96 * 1024 * 1024;

export function stagingRoot(paths: DesignLibraryPaths): string {
  return path.join(paths.home, 'characters', '.staging');
}

export function stagingDir(paths: DesignLibraryPaths, key: string): string {
  return path.join(stagingRoot(paths), assertSafeId(key, 'staging key'));
}

/**
 * Chunks are stored one file per index rather than appended, so they can arrive
 * out of order and a retried chunk overwrites cleanly.
 */
export async function stageChunk(
  paths: DesignLibraryPaths,
  key: string,
  name: string,
  index: number,
  base64: string,
): Promise<number> {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength > STAGING_CHUNK_BYTES) {
    throw new Error(`Chunk ${index} is ${bytes.byteLength} bytes, over the ${STAGING_CHUNK_BYTES} limit.`);
  }
  const dir = path.join(stagingDir(paths, key), assertSafeId(name, 'staged file name'));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${index}.part`), bytes);
  return bytes.byteLength;
}

/** One staged file, reassembled from its chunks in index order. */
async function assemble(dir: string): Promise<Buffer> {
  const parts = await readdir(dir).catch(() => []);
  const ordered = parts
    .filter((part) => part.endsWith('.part'))
    .map((part) => ({ part, index: Number.parseInt(part, 10) }))
    .filter((entry) => Number.isFinite(entry.index))
    .toSorted((a, b) => a.index - b.index);
  const chunks: Buffer[] = [];
  let total = 0;
  for (const entry of ordered) {
    const bytes = await readFile(path.join(dir, entry.part));
    total += bytes.byteLength;
    if (total > MAX_STAGED_BYTES) throw new Error('The staged files are over the size limit.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/**
 * Everything staged under a key, in the order the names sort.
 *
 * The page names frames `000`, `001`, … so sorting by name is sorting by time.
 * That ordering is the animation, so it is not left to the file system to decide.
 */
export async function readStaged(
  paths: DesignLibraryPaths,
  key: string,
): Promise<{ name: string; bytes: Buffer }[]> {
  const dir = stagingDir(paths, key);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const files: { name: string; bytes: Buffer }[] = [];
  for (const name of names) {
    files.push({ name, bytes: await assemble(path.join(dir, name)) });
  }
  return files;
}

export async function clearStaged(paths: DesignLibraryPaths, key: string): Promise<void> {
  await rm(stagingDir(paths, key), { recursive: true, force: true });
}

/**
 * Drop staging directories nothing is waiting on any more.
 *
 * A page closed mid-upload leaves bytes behind, and they are worth nothing to
 * anyone once the request that would have consumed them is gone.
 */
export async function pruneStaging(
  paths: DesignLibraryPaths,
  olderThanMs: number,
  now: number,
  keep: ReadonlySet<string>,
): Promise<number> {
  const entries = await readdir(stagingRoot(paths), { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    const dir = path.join(stagingRoot(paths), entry.name);
    const { mtimeMs } = await import('node:fs/promises').then((fs) => fs.stat(dir));
    if (now - mtimeMs < olderThanMs) continue;
    await rm(dir, { recursive: true, force: true });
    removed++;
  }
  return removed;
}
