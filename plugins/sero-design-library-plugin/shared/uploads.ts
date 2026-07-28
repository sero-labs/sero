import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { MediaProvenance } from './media';
import type { DesignLibraryPaths } from './paths';
import { uploadDir, uploadManifestFile } from './paths';
import { readJsonFile, writeJsonFile } from './state-io';
import type { ItemSourceKind, MediaKind } from './records';

/**
 * The staging area every import method converges on (spec §5.2).
 *
 * File picker, drag-and-drop and clipboard paste all produce the same thing —
 * bytes in the renderer — so they all take the same route: begin, push
 * bounded chunks, complete. One pipeline means duplicate detection, preview
 * storage and analysis kick-off are written once rather than three times.
 *
 * Staging files are scratch, not records: the uploader writes them and the
 * runtime consumes and deletes them. Records stay runtime-only.
 */

/** Chunks are bounded so a large image cannot arrive as one enormous tool call. */
export const UPLOAD_CHUNK_BYTES = 512 * 1024;
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/**
 * `frames` is a filmstrip: one image holding several moments of a video side by
 * side (D4, and the UI-decode decision). One attachment rather than four —
 * the Librarian sees the progression in a single look, and the upload stays one
 * role rather than a variable number of them.
 */
export type UploadRole = 'original' | 'preview' | 'frames';

export const UPLOAD_ROLES: readonly UploadRole[] = ['original', 'preview', 'frames'] as const;

export function isUploadRole(value: unknown): value is UploadRole {
  return typeof value === 'string' && (UPLOAD_ROLES as readonly string[]).includes(value);
}

export interface UploadManifest {
  id: string;
  fileName: string;
  mediaType: string;
  kind: MediaKind;
  sourceKind: ItemSourceKind;
  /**
   * Number of chunks the uploader will send for each role.
   *
   * Partial because `frames` arrived after the first manifests were written, and
   * a stored upload without the key must still verify rather than counting
   * `undefined` chunks and refusing itself.
   */
  chunkCounts: Partial<Record<UploadRole, number>> & { original: number; preview: number };
  previewMediaType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  parentItemId?: string;
  /**
   * Present when the bytes were generated rather than imported, so the item this
   * becomes keeps its provenance (spec §6.6).
   */
  generation?: MediaProvenance;
  /**
   * A generated video whose frames have not been extracted yet. Video is decoded
   * in the renderer, so the item is created before there is anything to
   * thumbnail or analyse.
   */
  awaitingFrames?: boolean;
  createdAt: number;
  complete: boolean;
}

function roleDir(paths: DesignLibraryPaths, uploadId: string, role: UploadRole): string {
  return path.join(uploadDir(paths, uploadId), role);
}

export async function beginUpload(
  paths: DesignLibraryPaths,
  manifest: UploadManifest,
): Promise<void> {
  for (const role of UPLOAD_ROLES) {
    await mkdir(roleDir(paths, manifest.id, role), { recursive: true });
  }
  await writeJsonFile(uploadManifestFile(paths, manifest.id), manifest);
}

export async function readUploadManifest(
  paths: DesignLibraryPaths,
  uploadId: string,
): Promise<UploadManifest | null> {
  return readJsonFile<UploadManifest>(uploadManifestFile(paths, uploadId));
}

/**
 * Chunks are stored one file per index rather than appended, so they can
 * arrive out of order and a retried chunk overwrites cleanly.
 */
export async function writeUploadChunk(
  paths: DesignLibraryPaths,
  uploadId: string,
  role: UploadRole,
  index: number,
  base64: string,
): Promise<number> {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength > UPLOAD_CHUNK_BYTES) {
    throw new Error(`Chunk ${index} is ${bytes.byteLength} bytes, over the ${UPLOAD_CHUNK_BYTES} limit`);
  }
  const dir = roleDir(paths, uploadId, role);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${index}.part`), bytes);
  return bytes.byteLength;
}

interface RoleParts {
  /** Ascending chunk indices actually present on disk. */
  indices: number[];
  bytes: number;
}

async function inspectRole(
  paths: DesignLibraryPaths,
  uploadId: string,
  role: UploadRole,
): Promise<RoleParts> {
  const dir = roleDir(paths, uploadId, role);
  const entries = await readdir(dir).catch(() => []);
  const indices = entries
    .flatMap((entry) => {
      if (!entry.endsWith('.part')) return [];
      const index = Number.parseInt(entry.slice(0, -'.part'.length), 10);
      return Number.isInteger(index) ? [index] : [];
    })
    .sort((a, b) => a - b);
  const sizes = await Promise.all(
    indices.map((index) => stat(path.join(dir, `${index}.part`)).then((info) => info.size)),
  );
  return { indices, bytes: sizes.reduce((total, size) => total + size, 0) };
}

/**
 * Everything that would stop this upload assembling into an item, checked
 * before it is marked complete rather than after ingestion has already been
 * queued against it.
 */
export async function verifyUpload(
  paths: DesignLibraryPaths,
  manifest: UploadManifest,
): Promise<string[]> {
  const roles = UPLOAD_ROLES;
  const parts = await Promise.all(roles.map((role) => inspectRole(paths, manifest.id, role)));

  const problems = roles.flatMap((role, position) => {
    const expected = manifest.chunkCounts[role] ?? 0;
    const { indices } = parts[position] ?? { indices: [], bytes: 0 };
    if (indices.length !== expected) {
      return [`${role}: the manifest promised ${expected} chunk(s) but ${indices.length} arrived`];
    }
    // Contiguous from zero, because assembly concatenates in index order and a
    // gap would silently produce a truncated file rather than an error.
    return indices.every((index, slot) => index === slot)
      ? []
      : [`${role}: chunk indices are not contiguous from 0`];
  });

  const total = parts.reduce((sum, role) => sum + role.bytes, 0);
  if (total > MAX_UPLOAD_BYTES) {
    problems.push(`the upload is ${total} bytes, over the ${MAX_UPLOAD_BYTES} byte limit`);
  }
  return problems;
}

/**
 * Mark an upload ready for ingestion, but only once it can actually be
 * assembled. An upload that fails here is discarded on the spot: pruning
 * deliberately spares completed uploads, so one marked complete and then found
 * unusable would keep its chunks on disk for good.
 */
export async function completeUpload(paths: DesignLibraryPaths, uploadId: string): Promise<void> {
  const manifest = await readUploadManifest(paths, uploadId);
  if (!manifest) throw new Error(`Unknown upload ${uploadId}`);

  const problems = await verifyUpload(paths, manifest);
  if (problems.length > 0) {
    await discardUpload(paths, uploadId);
    throw new Error(`Upload ${uploadId} cannot be assembled — ${problems.join('; ')}`);
  }
  await writeJsonFile(uploadManifestFile(paths, uploadId), { ...manifest, complete: true });
}

/**
 * Stage bytes the runtime already holds, as one complete upload.
 *
 * Generated media takes the same route into the Library as an import rather than
 * writing an item directly, and deliberately: duplicate detection, asset layout
 * and the automatic analysis kick-off are defined once in `ingestUpload`, and a
 * second path to creating an item is a second place for them to drift. The
 * chunking is skipped because there is no process boundary to cross — the bytes
 * are already here.
 */
export async function stageGeneratedUpload(
  paths: DesignLibraryPaths,
  bytes: Uint8Array,
  details: Omit<UploadManifest, 'id' | 'chunkCounts' | 'createdAt' | 'complete'>,
): Promise<string> {
  const id = randomUUID();
  const manifest: UploadManifest = {
    ...details,
    id,
    chunkCounts: { original: 1, preview: 0, frames: 0 },
    createdAt: Date.now(),
    complete: false,
  };
  await beginUpload(paths, manifest);

  // Written directly rather than through `writeUploadChunk`, which caps a chunk
  // at the size the tool boundary needs; there is no such boundary here.
  await writeFile(path.join(roleDir(paths, id, 'original'), '0.part'), bytes);
  await completeUpload(paths, id);
  return id;
}

/** Assemble one role's chunks in index order. Returns null when nothing was sent. */
export async function assembleUpload(
  paths: DesignLibraryPaths,
  uploadId: string,
  role: UploadRole,
): Promise<Buffer | null> {
  const dir = roleDir(paths, uploadId, role);
  const entries = await readdir(dir).catch(() => []);
  const indices = entries
    .flatMap((entry) => {
      if (!entry.endsWith('.part')) return [];
      const index = Number.parseInt(entry.slice(0, -'.part'.length), 10);
      return Number.isInteger(index) ? [index] : [];
    })
    .sort((a, b) => a - b);
  if (indices.length === 0) return null;

  // Read in parallel, concatenate in index order — the chunks all end up in
  // memory for the concat anyway, so reading them one at a time bought nothing.
  const chunks = await Promise.all(indices.map((index) => readFile(path.join(dir, `${index}.part`))));
  const total = chunks.reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (total > MAX_UPLOAD_BYTES) {
    throw new Error(`Upload ${uploadId} exceeds the ${MAX_UPLOAD_BYTES} byte limit`);
  }
  return Buffer.concat(chunks);
}

export async function discardUpload(paths: DesignLibraryPaths, uploadId: string): Promise<void> {
  await rm(uploadDir(paths, uploadId), { recursive: true, force: true });
}

/**
 * Uploads abandoned before completion are cleaned up on runtime start.
 *
 * Age alone decides, including for completed uploads. Sparing those outright
 * was a leak: an upload completed just as the runtime went down is never
 * ingested, so nothing else would ever discard it.
 *
 * Age alone is not sufficient either, though. Pruning runs at startup, before
 * requests are drained, so an upload whose import is still queued — the app was
 * closed overnight between completing and ingesting — would have its chunks
 * deleted moments before the import went looking for them. `keep` carries the
 * ids those queued imports name, and they survive regardless of age.
 */
export async function pruneStaleUploads(
  paths: DesignLibraryPaths,
  olderThanMs: number,
  now = Date.now(),
  keep: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const entries = await readdir(paths.uploadsDir, { withFileTypes: true }).catch(() => []);

  // Uploads are independent, so they are inspected and removed concurrently.
  const outcomes = await Promise.all(
    entries.flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      if (keep.has(entry.name)) return [];
      return [
        (async () => {
          const manifest = await readUploadManifest(paths, entry.name);
          // A manifest that never appeared belongs to an upload that died
          // before it began; treat it as stale rather than leaving it forever.
          const age = manifest ? now - manifest.createdAt : olderThanMs + 1;
          if (age <= olderThanMs) return null;
          await discardUpload(paths, entry.name);
          return entry.name;
        })(),
      ];
    }),
  );
  return outcomes.filter((name): name is string => name !== null);
}
