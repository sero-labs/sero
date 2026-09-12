/**
 * Reproduction checks for output that a capture must not lose or inflate.
 *
 * A real child process writes the bytes, so these cover the whole path from the
 * spawned pipe, through the exec sink, into the capture files.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-streaming-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: root,
    SERO_HOST_ARTIFACTS_ROOT: root,
    SERO_HOME: root,
    SERO_CAPTURE_ROOT: `${root}/agent/captures`,
    SERO_HOST_RTK_STATE_ROOT: `${root}/agent/rtk`,
  };
});

vi.mock('@electron/platform/env', () => envMock);

import {
  CAPTURE_PENDING_HIGH_WATER_BYTES,
  OutputCapture,
  nodeCaptureFileSystem,
  type CaptureFileSystem,
} from '@electron/features/tool-capture/capture';
import { runStreamingExec } from '@electron/features/workspace/runtime/streaming-exec';

const CHUNK_BYTES = 64 * 1024;
const CHUNKS = 64; // 4 MiB, well past the pending bound

const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-streaming-test-'));
  roots.push(root);
  return root;
}

/** A child that writes `chunks` chunk-sized pieces and honours pipe backpressure. */
function emittingScript(chunks: number): string {
  return `
    const chunk = Buffer.alloc(${CHUNK_BYTES}, 120);
    (async () => {
      for (let index = 0; index < ${chunks}; index += 1) {
        if (!process.stdout.write(chunk)) {
          await new Promise((resolve) => process.stdout.once('drain', resolve));
        }
      }
    })();
  `;
}

/** Passing the real file system through a delay, so the sink cannot keep up. */
function slowFileSystem(onWritten: (bytes: number) => void): CaptureFileSystem {
  return {
    ...nodeCaptureFileSystem,
    async open(filePath) {
      const handle = await nodeCaptureFileSystem.open(filePath);
      return {
        async write(chunk: Buffer) {
          await new Promise((resolve) => setTimeout(resolve, 2));
          await handle.write(chunk);
          onWritten(chunk.length);
        },
        close: () => handle.close(),
      };
    },
  };
}

describe('streaming a command into a capture', () => {
  afterEach(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('bounds pending writes and still captures every byte', async () => {
    let offeredBytes = 0;
    let writtenBytes = 0;
    let peakPending = 0;
    let pauses = 0;

    const capture = new OutputCapture({
      producerSessionId: 'session-a',
      captureId: 'capture-1',
      captureRoot: tempRoot(),
      fileSystem: slowFileSystem((bytes) => { writtenBytes += bytes; }),
    });

    const outcome = await runStreamingExec({
      program: process.execPath,
      args: ['-e', emittingScript(CHUNKS)],
      timeoutMs: 60_000,
      sink: {
        write: (stream, chunk) => {
          // One received chunk becomes two queued writes: combined.log and the
          // stream file. Both count toward the pending bound.
          offeredBytes += chunk.length * 2;
          const pending = capture.write(stream, chunk);
          if (pending) pauses += 1;
          peakPending = Math.max(peakPending, offeredBytes - writtenBytes);
          return pending;
        },
        close: () => {},
      },
    });
    const record = await capture.finish();

    const totalBytes = CHUNK_BYTES * CHUNKS;
    expect(outcome.exitCode).toBe(0);
    // Complete: every byte the command produced reached the file.
    expect(capture.bytes).toBe(totalBytes);
    expect(record).toMatchObject({ complete: true });
    expect(fs.statSync(record?.combined?.hostPath as string).size).toBe(totalBytes);
    // Bounded: the sink asked the pipe to pause instead of holding the rest.
    expect(pauses).toBeGreaterThan(0);
    expect(peakPending).toBeLessThanOrEqual(CAPTURE_PENDING_HIGH_WATER_BYTES + CHUNK_BYTES * 2);
  });

  it('captures bytes that are not valid UTF-8 exactly', async () => {
    const raw = Buffer.from([0xff, 0x80, 0x41]);
    const capture = new OutputCapture({
      producerSessionId: 'session-a',
      captureId: 'capture-1',
      captureRoot: tempRoot(),
    });

    const outcome = await runStreamingExec({
      program: process.execPath,
      args: ['-e', `process.stdout.write(Buffer.from([${[...raw].join(', ')}]))`],
      timeoutMs: 30_000,
      sink: {
        write: (stream, chunk) => capture.write(stream, chunk),
        close: () => {},
      },
    });
    const record = await capture.finish();

    expect(outcome.exitCode).toBe(0);
    // Decoding the pipe first turned these three bytes into seven bytes of
    // replacement characters.
    expect(record?.stdout?.bytes).toBe(raw.length);
    expect(record?.combined?.bytes).toBe(raw.length);
    expect(fs.readFileSync(record?.stdout?.hostPath as string).equals(raw)).toBe(true);
  });
});
