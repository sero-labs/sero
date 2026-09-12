import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { StringDecoder } from 'string_decoder';

import { SERO_CAPTURE_ROOT } from '@electron/platform/env';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateTail, type TruncationResult } from '@electron/features/container/filesystem/truncate';
import { registerActiveCapture, releaseActiveCapture, awaitCaptureReference } from './active-captures';
import {
  TOOL_CAPTURE_RECORD_VERSION,
  type ToolCaptureRecord,
  type ToolCaptureStream,
  type ToolCaptureStreamKind,
} from './types';

/** Model-facing payload limits. The same limits the previous buffered path used. */
export const PAYLOAD_MAX_LINES = DEFAULT_MAX_LINES;
export const PAYLOAD_MAX_BYTES = DEFAULT_MAX_BYTES;

/**
 * Retained tail size. It is larger than the payload byte limit so the rendered
 * payload keeps any line that the byte-limited walk needs, and it is bounded so
 * a huge command does not pay memory for its full output.
 */
export const CAPTURE_TAIL_BYTES = 1024 * 1024;

/**
 * Maximum bytes of output that may wait to be written.
 *
 * A command can print far faster than the disk accepts writes. Without this
 * bound, every unwritten chunk stays in memory and a large command exhausts the
 * renderer's heap. When the bound is reached, `write` returns a promise and the
 * runtime pauses that pipe, so the child blocks instead of the process growing.
 */
export const CAPTURE_PENDING_HIGH_WATER_BYTES = 1024 * 1024;

export interface CaptureFileHandle {
  write(chunk: Buffer): Promise<void>;
  close(): Promise<void>;
}

export interface CaptureFileSystem {
  mkdir(directory: string): Promise<void>;
  open(filePath: string): Promise<CaptureFileHandle>;
  rm(target: string): Promise<void>;
  /** Byte length of a file, or undefined when it cannot be read. */
  size(filePath: string): Promise<number | undefined>;
}

export const nodeCaptureFileSystem: CaptureFileSystem = {
  async mkdir(directory) { await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 }); },
  async open(filePath) {
    const handle = await fs.promises.open(filePath, 'w', 0o600);
    return {
      async write(chunk) { await handle.write(chunk); },
      async close() { await handle.close(); },
    };
  },
  async rm(target) { await fs.promises.rm(target, { recursive: true, force: true }); },
  async size(filePath) {
    try {
      return (await fs.promises.stat(filePath)).size;
    } catch {
      return undefined;
    }
  },
};

export interface OutputCaptureOptions {
  producerSessionId: string;
  captureRoot?: string;
  /** Map a host path to the path valid where the command ran. */
  toRuntimePath?: (hostPath: string) => string;
  fileSystem?: CaptureFileSystem;
  tailLimitBytes?: number;
  now?: () => number;
  captureId?: string;
}

interface StreamSink {
  readonly kind: ToolCaptureStreamKind;
  filePath: string;
  handle?: CaptureFileHandle;
  queue: Buffer[];
  bytes: number;
  pumping: boolean;
  failed: boolean;
  openRequested: boolean;
}

/**
 * Owns one command's complete output capture.
 *
 * `write` never blocks and never throws: the command's pipes must keep draining
 * even when the disk is full. Disk failures disable persistence for this call
 * only; the bounded tail and the counters stay correct, and a partial file is
 * never advertised as complete.
 */
export class OutputCapture {
  private readonly options: Required<Pick<OutputCaptureOptions, 'producerSessionId' | 'captureRoot' | 'tailLimitBytes'>>;
  private readonly fileSystem: CaptureFileSystem;
  private readonly toRuntimePath: (hostPath: string) => string;
  private readonly now: () => number;
  private readonly captureId: string;
  private readonly directory: string;
  private readonly sinks: Record<ToolCaptureStreamKind, StreamSink>;
  private readonly openFailures = new Map<ToolCaptureStreamKind, string>();
  private tail = '';
  private droppedBytes = 0;
  private readonly decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
  private complete = false;
  private totalBytes = 0;
  private totalLines = 0;
  private finalized = false;
  private pump: Promise<void> = Promise.resolve();
  private pendingBytes = 0;
  private pendingDrains: Array<() => void> = [];

  constructor(options: OutputCaptureOptions) {
    this.options = {
      producerSessionId: options.producerSessionId,
      captureRoot: options.captureRoot ?? SERO_CAPTURE_ROOT,
      tailLimitBytes: options.tailLimitBytes ?? CAPTURE_TAIL_BYTES,
    };
    this.fileSystem = options.fileSystem ?? nodeCaptureFileSystem;
    this.toRuntimePath = options.toRuntimePath ?? ((hostPath) => hostPath);
    this.now = options.now ?? Date.now;
    this.captureId = options.captureId ?? `${this.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
    this.directory = path.join(this.options.captureRoot, sessionKey(options.producerSessionId), this.captureId);
    // The directory can exist before any session file references it, so
    // retention must know that this capture belongs to a running command.
    registerActiveCapture(this.directory);
    this.sinks = {
      combined: this.createSink('combined', 'combined.log'),
      stdout: this.createSink('stdout', 'stdout.log'),
      stderr: this.createSink('stderr', 'stderr.log'),
    };
  }

  get id(): string {
    return this.captureId;
  }

  get directoryPath(): string {
    return this.directory;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  get lines(): number {
    return this.totalLines;
  }

  /** True when no chunk was received on either stream. */
  get isEmpty(): boolean {
    return this.totalBytes === 0;
  }

  /**
   * Append one chunk. Never throws. It returns a promise only when the pending
   * writes have reached the in-memory bound, and the caller then pauses that
   * pipe until the promise resolves.
   */
  write(stream: 'stdout' | 'stderr', chunk: Buffer): void | Promise<void> {
    if (this.finalized || chunk.length === 0) return;
    // Persist the exact bytes and decode a separate copy for the model-facing
    // tail, so output that is not valid UTF-8 is captured unchanged.
    this.totalBytes += chunk.length;
    this.appendTail(this.decoders[stream].write(chunk));
    this.enqueue(this.sinks.combined, chunk);
    this.enqueue(this.sinks[stream], chunk);
    if (this.pendingBytes < CAPTURE_PENDING_HIGH_WATER_BYTES) return;
    return new Promise<void>((resolve) => { this.pendingDrains.push(resolve); });
  }

  /** The bounded tail rendered with the ordinary payload truncation and markers. */
  renderPayload(): TruncationResult {
    const result = truncateTail(this.tail.trim(), { maxLines: PAYLOAD_MAX_LINES, maxBytes: PAYLOAD_MAX_BYTES });
    if (this.droppedBytes === 0) return result;
    return {
      ...result,
      truncated: true,
      truncatedBy: result.truncatedBy ?? (this.totalBytes > PAYLOAD_MAX_BYTES ? 'bytes' : 'lines'),
      totalBytes: this.totalBytes,
      totalLines: this.totalLines,
    };
  }

  /**
   * Flush, close and finalize. Returns `undefined` when the command wrote
   * nothing, and an incomplete record when persistence failed.
   */
  async finish(): Promise<ToolCaptureRecord | undefined> {
    if (this.finalized) return undefined;
    this.finalized = true;
    this.appendTail(this.decoders.stdout.end());
    this.appendTail(this.decoders.stderr.end());
    await this.drain();
    await this.closeAll();

    const failure = this.persistenceFailure() ?? await this.verifyPersisted();
    if (!failure && this.totalBytes === 0) {
      await this.removeDirectory();
      this.release();
      return undefined;
    }
    if (failure) {
      await this.removeDirectory();
      this.release();
      return {
        version: TOOL_CAPTURE_RECORD_VERSION,
        captureId: this.captureId,
        producerSessionId: this.options.producerSessionId,
        complete: false,
        unavailableReason: failure,
      };
    }

    this.complete = true;
    return {
      version: TOOL_CAPTURE_RECORD_VERSION,
      captureId: this.captureId,
      producerSessionId: this.options.producerSessionId,
      complete: true,
      combined: this.streamRecord(this.sinks.combined),
      ...(this.sinks.stdout.bytes > 0 ? { stdout: this.streamRecord(this.sinks.stdout) } : {}),
      ...(this.sinks.stderr.bytes > 0 ? { stderr: this.streamRecord(this.sinks.stderr) } : {}),
    };
  }

  /** Remove every file in this capture. Used by retention and by failed cleanup retries. */
  async discard(): Promise<void> {
    await this.removeDirectory();
    releaseActiveCapture(this.directory);
  }

  /** Keep a successful result protected until retention observes its reference. */
  release(): void {
    if (this.complete) awaitCaptureReference(this.directory, this.captureId);
    else releaseActiveCapture(this.directory);
  }

  private createSink(kind: ToolCaptureStreamKind, fileName: string): StreamSink {
    return {
      kind,
      filePath: path.join(this.directory, fileName),
      queue: [],
      bytes: 0,
      pumping: false,
      failed: false,
      openRequested: false,
    };
  }

  private appendTail(chunk: string): void {
    this.tail += chunk;
    this.totalLines += countNewlines(chunk);
    const bytes = Buffer.byteLength(this.tail, 'utf8');
    if (bytes > this.options.tailLimitBytes) {
      // Keep a byte tail even when its final line ends with a newline. Dropping
      // that entire line would discard the newest output too.
      this.tail = keepTailBytes(this.tail, this.options.tailLimitBytes);
      this.droppedBytes += bytes - Buffer.byteLength(this.tail, 'utf8');
    }
  }

  private enqueue(sink: StreamSink, chunk: Buffer): void {
    if (sink.failed) return;
    sink.bytes += chunk.length;
    sink.queue.push(chunk);
    this.pendingBytes += chunk.length;
    this.pump = this.pump.then(() => this.drainSink(sink));
  }

  private async drain(): Promise<void> {
    await this.pump;
  }

  private async drainSink(sink: StreamSink): Promise<void> {
    if (sink.failed) { this.discardQueue(sink); return; }
    if (!sink.openRequested) {
      sink.openRequested = true;
      try {
        await this.fileSystem.mkdir(this.directory);
        sink.handle = await this.fileSystem.open(sink.filePath);
      } catch (error) {
        this.failSink(sink, error);
        return;
      }
    }
    while (sink.queue.length > 0) {
      const chunk = sink.queue[0];
      try {
        await sink.handle?.write(chunk);
      } catch (error) {
        this.failSink(sink, error);
        return;
      }
      sink.queue.shift();
      this.pendingBytes -= chunk.length;
    }
    this.releasePendingDrains();
  }

  private failSink(sink: StreamSink, error: unknown): void {
    sink.failed = true;
    this.discardQueue(sink);
    this.openFailures.set(sink.kind, errorMessage(error));
  }

  /** Drop the queued bytes of one sink and keep the pending count honest. */
  private discardQueue(sink: StreamSink): void {
    for (const chunk of sink.queue) this.pendingBytes -= chunk.length;
    sink.queue.length = 0;
    this.releasePendingDrains();
  }

  /**
   * Let paused pipes continue once nothing waits to be written. Resuming only at
   * zero keeps the bound strict and cannot spin, because the pump drains without
   * help from the paused pipe.
   */
  private releasePendingDrains(): void {
    if (this.pendingBytes > 0) return;
    const waiting = this.pendingDrains;
    this.pendingDrains = [];
    for (const resolve of waiting) resolve();
  }

  private async closeAll(): Promise<void> {
    for (const sink of [this.sinks.combined, this.sinks.stdout, this.sinks.stderr]) {
      if (!sink.handle) continue;
      try {
        await sink.handle.close();
      } catch (error) {
        this.failSink(sink, error);
      }
    }
  }

  private persistenceFailure(): string | undefined {
    const failed = [this.sinks.combined, this.sinks.stdout, this.sinks.stderr].find((sink) => sink.failed);
    if (!failed) return undefined;
    const detail = this.openFailures.get(failed.kind) ?? 'unknown error';
    return `Complete output could not be saved (${failed.kind}: ${detail}).`;
  }

  /**
   * Confirm that every file this record will name is on disk with the length
   * that was written. `complete: true` must mean the reader can open the file,
   * so a file removed while the command ran is reported as unavailable.
   */
  private async verifyPersisted(): Promise<string | undefined> {
    if (this.totalBytes === 0) return undefined;
    for (const sink of [this.sinks.combined, this.sinks.stdout, this.sinks.stderr]) {
      if (sink.bytes === 0 || sink.failed) continue;
      if (await this.fileSystem.size(sink.filePath) !== sink.bytes) {
        return `Complete output could not be saved (${sink.kind}: the capture file is missing or incomplete).`;
      }
    }
    return undefined;
  }

  private streamRecord(sink: StreamSink): ToolCaptureStream {
    return {
      stream: sink.kind,
      hostPath: sink.filePath,
      runtimePath: this.toRuntimePath(sink.filePath),
      bytes: sink.bytes,
    };
  }

  private async removeDirectory(): Promise<void> {
    try {
      await this.fileSystem.rm(this.directory);
    } catch {
      // A failed cleanup retry is safe: the orphan sweep removes the directory
      // after its last session reference is released.
    }
  }
}

function countNewlines(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') count += 1;
  }
  return count;
}

/**
 * Keep the last `limit` bytes of a value, cut on a character boundary.
 *
 * Trimming one over-long line cuts at a byte offset, which can land inside a
 * multi-byte character, so step forward to the next character start first.
 */
function keepTailBytes(value: string, limit: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= limit) return value;
  let start = bytes.length - limit;
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  return bytes.subarray(start).toString('utf8');
}

function sessionKey(sessionId: string): string {
  return encodeURIComponent(sessionId);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
