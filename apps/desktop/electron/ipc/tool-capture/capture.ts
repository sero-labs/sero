/**
 * Complete tool-output capture IPC handlers.
 *
 * The desktop UI reads a reported capture file through this channel. The
 * channel is confined to the capture root, so a renderer cannot name an arbitrary
 * host path. Reads are bounded so a multi-megabyte capture never arrives in one
 * renderer message; the caller pages with `nextOffset`.
 */

import fs from 'fs';
import path from 'path';
import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type { ToolCaptureReadRequest, ToolCaptureReadResult } from '@/types/tool-capture';
import { SERO_CAPTURE_ROOT } from '@electron/platform/env';
import { isPathInsideDirectory } from '@electron/shared/lib/path-confinement';

/** Default slice size, small enough to keep one renderer message cheap. */
export const DEFAULT_CAPTURE_READ_BYTES = 256 * 1024;
/** Hard ceiling for one slice, whatever the renderer asks for. */
export const MAX_CAPTURE_READ_BYTES = 4 * 1024 * 1024;

export async function readCaptureSlice(
  request: ToolCaptureReadRequest,
  captureRoot: string = SERO_CAPTURE_ROOT,
): Promise<ToolCaptureReadResult> {
  const resolved = path.resolve(String(request?.path ?? ''));
  if (!isPathInsideDirectory(resolved, captureRoot)) {
    throw new Error('Refusing to read a capture outside the capture root');
  }

  const limitBytes = clampLimit(request.limitBytes);
  const offset = Number.isFinite(request.offset) ? Math.max(0, Math.floor(request.offset as number)) : 0;

  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(resolved, 'r');
  } catch {
    return unavailable('The complete output file is no longer available.');
  }

  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return unavailable('The complete output path is not a file.');
    if (offset >= stats.size) return { state: 'ok', content: '', totalBytes: stats.size };

    const length = Math.min(limitBytes, stats.size - offset);
    const buffer = Buffer.alloc(length);
    const bytesRead = await readFully(handle, buffer, offset);
    const truncated = offset + bytesRead < stats.size;
    const usable = utf8SafeLength(buffer.subarray(0, bytesRead), truncated);
    const content = buffer.subarray(0, usable).toString('utf8');
    const nextOffset = offset + usable < stats.size ? offset + usable : undefined;

    return {
      state: 'ok',
      content,
      totalBytes: stats.size,
      ...(nextOffset === undefined ? {} : { nextOffset }),
    };
  } catch {
    return unavailable('The complete output file could not be read.');
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export function registerToolCaptureHandlers(): void {
  ipcMain.handle(
    IpcChannels.toolCapture.readCapture,
    async (_event, request: ToolCaptureReadRequest): Promise<ToolCaptureReadResult> => readCaptureSlice(request),
  );
}

function clampLimit(requested: number | undefined): number {
  if (!Number.isFinite(requested)) return DEFAULT_CAPTURE_READ_BYTES;
  return Math.min(Math.max(1, Math.floor(requested as number)), MAX_CAPTURE_READ_BYTES);
}

async function readFully(handle: fs.promises.FileHandle, buffer: Buffer, offset: number): Promise<number> {
  let total = 0;
  while (total < buffer.length) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, offset + total);
    if (bytesRead === 0) break;
    total += bytesRead;
  }
  return total;
}

/**
 * Drop a trailing incomplete UTF-8 sequence so a slice boundary cannot inject a
 * replacement character. The dropped bytes are re-read by the next slice.
 */
function utf8SafeLength(buffer: Buffer, truncated: boolean): number {
  if (!truncated) return buffer.length;

  let length = buffer.length;
  let continuation = 0;
  while (length > 0 && continuation < 3 && (buffer[length - 1] & 0xc0) === 0x80) {
    length -= 1;
    continuation += 1;
  }
  if (length === 0) return buffer.length;

  const lead = buffer[length - 1];
  const expected = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  return expected > continuation + 1 ? length - 1 : buffer.length;
}

function unavailable(reason: string): ToolCaptureReadResult {
  return { state: 'unavailable', content: '', totalBytes: 0, reason };
}
