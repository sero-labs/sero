import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { SERO_CAPTURE_ROOT } from '@electron/platform/env';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateTail, type TruncationResult } from '@electron/features/container/filesystem/truncate';
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

export interface CaptureFileHandle {
  write(chunk: Buffer): Promise<void>;
  close(): Promise<void>;
}

export interface CaptureFileSystem {
  mkdir(directory: string): Promise<void>;
  open(filePath: string): Promise<CaptureFileHandle>;
  rm(target: string): Promise<void>;
}

const nodeCaptureFileSystem: CaptureFileSystem = {
  async mkdir(directory) { await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 }); },
  async open(filePath) {
    const handle = await fs.promises.open(filePath, 'w', 0o600);
    return {
      async write(chunk) { await handle.write(chunk); },
      async close() { await handle.close(); },
    };
  },
  async rm(target) { await fs.promises.rm(target, { recursive: true, force: true }); },
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
  private droppedLines = 0;
  private totalBytes = 0;
  private totalLines = 0;
  private finalized = false;
  private pump: Promise<void> = Promise.resolve();

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

  /** Append one chunk. Never throws and never awaits. */
  write(stream: 'stdout' | 'stderr', chunk: string): void {
    if (this.finalized || chunk.length === 0) return;
    this.appendTail(chunk);
    this.enqueue(this.sinks.combined, Buffer.from(chunk, 'utf8'));
    this.enqueue(this.sinks[stream], Buffer.from(chunk, 'utf8'));
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
    await this.drain();
    await this.closeAll();

    const failure = this.persistenceFailure();
    if (!failure && this.totalBytes === 0) {
      await this.removeDirectory();
      return undefined;
    }
    if (failure) {
      await this.removeDirectory();
      return {
        version: TOOL_CAPTURE_RECORD_VERSION,
        captureId: this.captureId,
        producerSessionId: this.options.producerSessionId,
        complete: false,
        unavailableReason: failure,
      };
    }

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
    this.totalBytes += Buffer.byteLength(chunk, 'utf8');
    this.totalLines += countNewlines(chunk);
    const limit = this.options.tailLimitBytes;
    while (Buffer.byteLength(this.tail, 'utf8') > limit) {
      const newline = this.tail.indexOf('\n');
      if (newline === -1) {
        this.droppedBytes += Buffer.byteLength(this.tail, 'utf8');
        this.tail = '';
        return;
      }
      const removed = this.tail.slice(0, newline + 1);
      this.droppedBytes += Buffer.byteLength(removed, 'utf8');
      this.droppedLines += countNewlines(removed);
      this.tail = this.tail.slice(newline + 1);
    }
  }

  private enqueue(sink: StreamSink, chunk: Buffer): void {
    if (sink.failed) return;
    sink.bytes += chunk.length;
    sink.queue.push(chunk);
    this.pump = this.pump.then(() => this.drainSink(sink));
  }

  private async drain(): Promise<void> {
    await this.pump;
  }

  private async drainSink(sink: StreamSink): Promise<void> {
    if (sink.failed) { sink.queue.length = 0; return; }
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
      const chunk = sink.queue.shift() as Buffer;
      try {
        await sink.handle?.write(chunk);
      } catch (error) {
        this.failSink(sink, error);
        return;
      }
    }
  }

  private failSink(sink: StreamSink, error: unknown): void {
    sink.failed = true;
    sink.queue.length = 0;
    this.openFailures.set(sink.kind, errorMessage(error));
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

function sessionKey(sessionId: string): string {
  return encodeURIComponent(sessionId);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
