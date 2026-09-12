import fs from 'node:fs';

/**
 * Read the typed complete-output capture out of a bash result's details.
 *
 * Capture bytes are the authoritative source. The plugin never compacts the
 * truncated tool text.
 */

export type CaptureStreamKind = 'combined' | 'stdout' | 'stderr';

export interface CaptureStream {
  stream: CaptureStreamKind;
  runtimePath: string;
  hostPath: string;
  bytes: number;
}

export interface CaptureRecord {
  captureId: string;
  complete: boolean;
  combined?: CaptureStream;
  stdout?: CaptureStream;
  stderr?: CaptureStream;
  unavailableReason?: string;
}

export interface CaptureContent {
  text: string;
  bytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStream(value: unknown): CaptureStream | undefined {
  if (!isRecord(value)) return undefined;
  const stream = value.stream;
  if (stream !== 'combined' && stream !== 'stdout' && stream !== 'stderr') return undefined;
  if (typeof value.hostPath !== 'string' || value.hostPath.length === 0) return undefined;
  return {
    stream,
    runtimePath: typeof value.runtimePath === 'string' ? value.runtimePath : value.hostPath,
    hostPath: value.hostPath,
    bytes: typeof value.bytes === 'number' && Number.isFinite(value.bytes) ? value.bytes : 0,
  };
}

export function parseCaptureRecord(details: unknown): CaptureRecord | null {
  if (!isRecord(details)) return null;
  const value = details.capture;
  if (!isRecord(value)) return null;
  if (typeof value.captureId !== 'string' || value.captureId.length === 0) return null;
  return {
    captureId: value.captureId,
    complete: value.complete === true,
    combined: parseStream(value.combined),
    stdout: parseStream(value.stdout),
    stderr: parseStream(value.stderr),
    unavailableReason: typeof value.unavailableReason === 'string' ? value.unavailableReason : undefined,
  };
}

/**
 * A positive zero-output signal.
 *
 * The host creates no capture record when a command completed successfully
 * with zero bytes. Absence of a record alone is not proof, so require the
 * bash tool's own `exitCode` metadata and the absence of both a capture record
 * and truncation metadata.
 */
export function isConfirmedZeroOutput(details: unknown): boolean {
  if (!isRecord(details)) return false;
  return typeof details.exitCode === 'number'
    && details.capture === undefined
    && details.truncation === undefined;
}

/** Read one capture stream as the exact bytes it holds. */
export async function readCaptureContent(stream: CaptureStream): Promise<CaptureContent | null> {
  try {
    const buffer = await fs.promises.readFile(stream.hostPath);
    return { text: buffer.toString('utf8'), bytes: buffer.length };
  } catch {
    return null;
  }
}
