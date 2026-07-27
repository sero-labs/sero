import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

export type UploadRole = 'original' | 'preview';

export interface UploadManifest {
  id: string;
  fileName: string;
  mediaType: string;
  kind: MediaKind;
  sourceKind: ItemSourceKind;
  /** Number of chunks the uploader will send for each role. */
  chunkCounts: Record<UploadRole, number>;
  previewMediaType: string;
  width?: number;
  height?: number;
  parentItemId?: string;
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
  await mkdir(roleDir(paths, manifest.id, 'original'), { recursive: true });
  await mkdir(roleDir(paths, manifest.id, 'preview'), { recursive: true });
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

export async function completeUpload(paths: DesignLibraryPaths, uploadId: string): Promise<void> {
  const manifest = await readUploadManifest(paths, uploadId);
  if (!manifest) throw new Error(`Unknown upload ${uploadId}`);
  await writeJsonFile(uploadManifestFile(paths, uploadId), { ...manifest, complete: true });
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

/** Uploads abandoned before completion are cleaned up on runtime start. */
export async function pruneStaleUploads(
  paths: DesignLibraryPaths,
  olderThanMs: number,
  now = Date.now(),
): Promise<string[]> {
  const entries = await readdir(paths.uploadsDir, { withFileTypes: true }).catch(() => []);

  // Uploads are independent, so they are inspected and removed concurrently.
  const outcomes = await Promise.all(
    entries.flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      return [
        (async () => {
          const manifest = await readUploadManifest(paths, entry.name);
          // A manifest that never appeared belongs to an upload that died
          // before it began; treat it as stale rather than leaving it forever.
          const age = manifest ? now - manifest.createdAt : olderThanMs + 1;
          if (manifest?.complete === true || age <= olderThanMs) return null;
          await discardUpload(paths, entry.name);
          return entry.name;
        })(),
      ];
    }),
  );
  return outcomes.filter((name): name is string => name !== null);
}
