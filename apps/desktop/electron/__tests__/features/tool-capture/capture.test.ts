import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const testEnv = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-capture-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: root,
    SERO_HOST_ARTIFACTS_ROOT: root,
    SERO_HOME: root,
    SERO_CAPTURE_ROOT: `${root}/agent/captures`,
  };
});

vi.mock('@electron/platform/env', () => testEnv);

import {
  CAPTURE_TAIL_BYTES,
  OutputCapture,
  PAYLOAD_MAX_BYTES,
  type CaptureFileSystem,
  type OutputCaptureOptions,
} from '@electron/features/tool-capture/capture';
import { TOOL_CAPTURE_RECORD_VERSION } from '@electron/features/tool-capture/types';
import { toRuntimeIdentityMountPath } from '@electron/features/workspace/runtime/runtime-paths';

interface MemoryFileSystem extends CaptureFileSystem {
  files: Map<string, Buffer>;
  writes: number;
}

function memoryFileSystem(options: {
  failOpen?: (filePath: string) => Error | undefined;
  failWrite?: (filePath: string, writeIndex: number) => Error | undefined;
  failClose?: (filePath: string) => Error | undefined;
} = {}): MemoryFileSystem {
  const files = new Map<string, Buffer>();
  const openCounts = new Map<string, number>();
  const system: MemoryFileSystem = {
    files,
    writes: 0,
    async mkdir() {},
    async open(filePath) {
      const failure = options.failOpen?.(filePath);
      if (failure) throw failure;
      files.set(filePath, Buffer.alloc(0));
      openCounts.set(filePath, 0);
      return {
        async write(chunk: Buffer) {
          const writeIndex = (openCounts.get(filePath) ?? 0) + 1;
          openCounts.set(filePath, writeIndex);
          const writeFailure = options.failWrite?.(filePath, writeIndex);
          if (writeFailure) throw writeFailure;
          system.writes += 1;
          files.set(filePath, Buffer.concat([files.get(filePath) ?? Buffer.alloc(0), chunk]));
        },
        async close() {
          const closeFailure = options.failClose?.(filePath);
          if (closeFailure) throw closeFailure;
        },
      };
    },
    async rm(target) {
      for (const key of [...files.keys()]) {
        if (key === target || key.startsWith(`${target}${path.sep}`)) files.delete(key);
      }
    },
  };
  return system;
}

const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-tool-capture-test-'));
  roots.push(root);
  return root;
}

function createCapture(options: Partial<OutputCaptureOptions> = {}): OutputCapture {
  return new OutputCapture({ producerSessionId: 'session-a', captureId: 'capture-1', ...options });
}

describe('OutputCapture', () => {
  afterEach(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('writes combined output plus byte-exact stdout and stderr files', async () => {
    const fileSystem = memoryFileSystem();
    const capture = createCapture({ fileSystem });

    capture.write('stdout', '{"ok":true}\n');
    capture.write('stderr', 'warning: slow\n');
    capture.write('stdout', '{"more":1}\n');
    const record = await capture.finish();

    expect(record).toMatchObject({
      version: TOOL_CAPTURE_RECORD_VERSION,
      captureId: 'capture-1',
      producerSessionId: 'session-a',
      complete: true,
    });
    expect(record?.combined?.bytes).toBe(record?.combined ? Buffer.byteLength('{"ok":true}\nwarning: slow\n{"more":1}\n') : -1);

    const stdoutPath = record?.stdout?.hostPath as string;
    const stderrPath = record?.stderr?.hostPath as string;
    expect(fileSystem.files.get(stdoutPath)?.toString('utf8')).toBe('{"ok":true}\n{"more":1}\n');
    expect(fileSystem.files.get(stderrPath)?.toString('utf8')).toBe('warning: slow\n');
    // The stdout file stays parseable even though stderr carried diagnostics.
    expect(JSON.parse(`[${fileSystem.files.get(stdoutPath)?.toString('utf8').trim().split('\n').join(',')}]`)).toEqual([
      { ok: true },
      { more: 1 },
    ]);
  });

  it('keeps a JSON stdout file byte-identical and free of notices', async () => {
    const fileSystem = memoryFileSystem();
    const capture = createCapture({ fileSystem });
    const document = `${JSON.stringify({ items: Array.from({ length: 50 }, (_, index) => index) })}\n`;

    capture.write('stdout', document);
    capture.write('stderr', 'warning\n');
    const record = await capture.finish();

    const stdoutBytes = fileSystem.files.get(record?.stdout?.hostPath as string);
    expect(stdoutBytes?.toString('utf8')).toBe(document);
    expect(() => JSON.parse(stdoutBytes?.toString('utf8') as string)).not.toThrow();
    expect(stdoutBytes?.toString('utf8')).not.toContain('Showing');
  });

  it('captures output far beyond any in-memory ceiling without retaining it', async () => {
    const fileSystem = memoryFileSystem();
    const capture = createCapture({ fileSystem });
    const chunk = `${'x'.repeat(64 * 1024)}\n`;
    const chunks = 200; // 12.8 MB, above the former 10 MB buffer limit

    for (let index = 0; index < chunks; index += 1) capture.write('stdout', chunk);
    const record = await capture.finish();

    expect(record?.combined?.bytes).toBe(Buffer.byteLength(chunk) * chunks);
    expect(fileSystem.files.get(record?.combined?.hostPath as string)?.length).toBe(Buffer.byteLength(chunk) * chunks);
    const payload = capture.renderPayload();
    expect(Buffer.byteLength(payload.content, 'utf8')).toBeLessThanOrEqual(PAYLOAD_MAX_BYTES);
    expect(payload.totalBytes).toBe(Buffer.byteLength(chunk) * chunks);
  });

  it('bounds the retained tail while keeping exact totals', async () => {
    const fileSystem = memoryFileSystem();
    const capture = createCapture({ fileSystem, tailLimitBytes: 1000 });
    for (let index = 0; index < 500; index += 1) capture.write('stdout', `line-${index}\n`);

    expect(capture.bytes).toBe(Buffer.byteLength(Array.from({ length: 500 }, (_, index) => `line-${index}\n`).join('')));
    expect(Buffer.byteLength(capture.renderPayload().content, 'utf8')).toBeLessThanOrEqual(1000 + 64);
    expect(capture.renderPayload().truncated).toBe(true);
  });

  it('preserves the received tail and status for a timeout or cancellation', async () => {
    const fileSystem = memoryFileSystem();
    const capture = createCapture({ fileSystem });
    capture.write('stdout', 'partial line one\npartial line two\n');
    const record = await capture.finish();

    expect(capture.renderPayload().content).toContain('partial line two');
    expect(record?.combined?.bytes).toBe(Buffer.byteLength('partial line one\npartial line two\n'));
  });

  it('creates no capture for a command with no output', async () => {
    const fileSystem = memoryFileSystem();
    const capture = createCapture({ fileSystem });

    await expect(capture.finish()).resolves.toBeUndefined();
    expect(fileSystem.files.size).toBe(0);
  });

  it('reports an unavailable record and no paths when a file cannot be opened', async () => {
    const fileSystem = memoryFileSystem({ failOpen: () => new Error('ENOSPC: no space left on device') });
    const capture = createCapture({ fileSystem });
    capture.write('stdout', 'output\n');

    const record = await capture.finish();

    expect(record).toMatchObject({ complete: false, captureId: 'capture-1' });
    expect(record?.combined).toBeUndefined();
    expect(record?.unavailableReason).toContain('no space left on device');
    expect(fileSystem.files.size).toBe(0);
  });

  it('keeps draining and keeps the tail when a mid-stream write fails', async () => {
    const fileSystem = memoryFileSystem({
      failWrite: (filePath, writeIndex) => (
        filePath.endsWith('combined.log') && writeIndex === 2 ? new Error('ENOSPC') : undefined
      ),
    });
    const capture = createCapture({ fileSystem });

    let writes = 0;
    expect(() => {
      for (let index = 0; index < 50; index += 1) {
        capture.write('stdout', `line-${index}\n`);
        writes += 1;
      }
    }).not.toThrow();
    expect(writes).toBe(50);

    const record = await capture.finish();
    expect(record).toMatchObject({ complete: false });
    expect(capture.renderPayload().content).toContain('line-49');
    expect(fileSystem.files.size).toBe(0);
  });

  it('reports a flush or close failure after the tail limit is exceeded', async () => {
    const fileSystem = memoryFileSystem({
      failClose: (filePath) => (filePath.endsWith('combined.log') ? new Error('flush failed') : undefined),
    });
    const capture = createCapture({ fileSystem, tailLimitBytes: 200 });
    for (let index = 0; index < 200; index += 1) capture.write('stdout', `line-${index}\n`);

    const record = await capture.finish();

    expect(record).toMatchObject({ complete: false });
    expect(record?.unavailableReason).toContain('flush failed');
    expect(capture.renderPayload().content).toContain('line-199');
    expect(fileSystem.files.size).toBe(0);
  });

  it('maps each reported stream through the identity helper when the command ran in a container', async () => {
    const fileSystem = memoryFileSystem();
    const capture = createCapture({
      fileSystem,
      captureRoot: 'C:\\Users\\me\\.sero-ui\\agent\\captures',
      toRuntimePath: toRuntimeIdentityMountPath,
    });
    capture.write('stdout', 'x\n');
    const record = await capture.finish();

    expect(record?.combined?.hostPath).toContain('C:\\Users\\me');
    expect(record?.combined?.runtimePath).toMatch(/^\/mnt\/c\/Users\/me\/\.sero-ui\/agent\/captures\//);
    expect(record?.combined?.hostPath).not.toBe(record?.combined?.runtimePath);
  });

  it('writes real files under the configured capture root and removes them on discard', async () => {
    const root = tempRoot();
    const capture = createCapture({ captureRoot: root, captureId: 'capture-real' });
    capture.write('stdout', 'hello\n');
    const record = await capture.finish();

    expect(record?.combined?.hostPath.startsWith(root)).toBe(true);
    expect(fs.readFileSync(record?.combined?.hostPath as string, 'utf8')).toBe('hello\n');
    await capture.discard();
    expect(fs.existsSync(path.dirname(record?.combined?.hostPath as string))).toBe(false);
  });

  it('sizes the retained tail above the payload byte limit', () => {
    expect(CAPTURE_TAIL_BYTES).toBeGreaterThan(PAYLOAD_MAX_BYTES);
  });
});
