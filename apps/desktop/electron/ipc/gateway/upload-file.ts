/**
 * File upload for the gateway.
 *
 * An upload lands in `uploads/` inside the workspace unless the caller
 * names a path. It never overwrites: a name already taken gets a numeric
 * suffix, and the resolved name comes back so the client can tell the
 * agent where the file is.
 */

import path from 'path';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import type { GatewayUploadResult } from '@electron/features/gateway/server/types';

/** Where an upload goes when the caller names no directory. */
export const DEFAULT_UPLOAD_DIR = 'uploads';

/** Largest upload accepted, in bytes of decoded content. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Suffixes tried before an upload gives up on finding a free name. */
const MAX_NAME_ATTEMPTS = 100;

/** Why an upload was refused. */
export type UploadRefusal =
  | 'upload_invalid_path'
  | 'upload_too_large'
  | 'upload_invalid_content'
  | 'upload_name_taken'
  | 'upload_unsupported_runtime';

export class UploadRefused extends Error {
  constructor(readonly reason: UploadRefusal, message: string) {
    super(message);
    this.name = 'UploadRefused';
  }
}

/**
 * A workspace-relative path with no traversal and no absolute root.
 *
 * The same guard `read_file` uses, plus a rejection of absolute paths,
 * because a write must never escape the workspace.
 */
export function normalizeUploadPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) throw new UploadRefused('upload_invalid_path', 'The upload needs a file name.');
  if (trimmed.includes('\0')) {
    throw new UploadRefused('upload_invalid_path', 'The path contains null bytes.');
  }
  if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    throw new UploadRefused('upload_invalid_path', 'The path must be inside the workspace.');
  }

  const segments = trimmed.split(/[\\/]/).filter((segment) => segment.length > 0 && segment !== '.');
  if (segments.length === 0) {
    throw new UploadRefused('upload_invalid_path', 'The upload needs a file name.');
  }
  if (segments.some((segment) => segment === '..')) {
    throw new UploadRefused('upload_invalid_path', 'Path traversal is not allowed.');
  }

  // A bare name goes to the uploads folder, which is what a share from a
  // phone sends. An explicit directory is kept as the caller wrote it.
  return segments.length === 1
    ? `${DEFAULT_UPLOAD_DIR}/${segments[0]}`
    : segments.join('/');
}

/** `report.pdf` → `report-1.pdf`, so an upload never overwrites. */
export function suffixName(filePath: string, attempt: number): string {
  const dir = path.posix.dirname(filePath);
  const ext = path.posix.extname(filePath);
  const base = path.posix.basename(filePath, ext);
  const suffixed = `${base}-${attempt}${ext}`;
  return dir === '.' ? suffixed : `${dir}/${suffixed}`;
}

/** True when a path already exists in the workspace. */
async function exists(runtime: RuntimeBackend, filePath: string): Promise<boolean> {
  try {
    await runtime.readFile({ path: filePath });
    return true;
  } catch {
    // Unreadable and missing look the same here. Treating unreadable as
    // free is wrong the other way, so this errs towards a new name.
    return false;
  }
}

/** The first free name at or after `filePath`. */
async function freeName(runtime: RuntimeBackend, filePath: string): Promise<string> {
  if (!(await exists(runtime, filePath))) return filePath;

  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const candidate = suffixName(filePath, attempt);
    if (!(await exists(runtime, candidate))) return candidate;
  }

  throw new UploadRefused(
    'upload_name_taken',
    'Too many files already use that name. Rename the file and try again.',
  );
}

/**
 * Write an uploaded file into the workspace.
 *
 * `contentBase64` is decoded here so the size cap applies to the real
 * bytes, not to the larger encoded string.
 */
export async function uploadFile(
  runtime: RuntimeBackend,
  rawPath: string,
  contentBase64: string,
): Promise<GatewayUploadResult> {
  const wantedPath = normalizeUploadPath(rawPath);

  const content = Buffer.from(contentBase64, 'base64');
  // Base64 decoding drops anything it cannot read rather than failing, so
  // an empty result from a non-empty input means the input was not base64.
  if (content.length === 0 && contentBase64.trim().length > 0) {
    throw new UploadRefused('upload_invalid_content', 'The file content is not valid base64.');
  }
  if (content.length > MAX_UPLOAD_BYTES) {
    throw new UploadRefused(
      'upload_too_large',
      `That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit.`,
    );
  }

  // The Apple Container backend writes the content string as text, so a
  // binary file would arrive corrupted. Refusing beats silent damage.
  if (runtime.backend === 'apple-container') {
    throw new UploadRefused(
      'upload_unsupported_runtime',
      'This workspace runs on Apple Container, which cannot take uploads yet. Use the desktop.',
    );
  }

  const filePath = await freeName(runtime, wantedPath);
  await runtime.writeFile({
    path: filePath,
    content: content.toString('base64'),
    encoding: 'base64',
  });

  return { path: filePath, bytes: content.length, renamed: filePath !== wantedPath };
}
