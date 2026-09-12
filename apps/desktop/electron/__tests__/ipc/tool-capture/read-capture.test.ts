import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  SERO_CAPTURE_ROOT: `/tmp/sero-vitest/${process.pid}-capture-ipc`,
}));

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('@electron/platform/env', () => envMock);

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { ToolCaptureReadRequest, ToolCaptureReadResult } from '@/types/tool-capture';
import {
  DEFAULT_CAPTURE_READ_BYTES,
  MAX_CAPTURE_READ_BYTES,
  readCaptureSlice,
  registerToolCaptureHandlers,
} from '@electron/ipc/tool-capture/capture';

const roots: string[] = [];

function captureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-tool-capture-read-'));
  roots.push(root);
  return root;
}

function writeCapture(root: string, fileName: string, content: string): string {
  const filePath = path.join(root, 'session-a', 'capture-1', fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

async function readSlice(content: string, options: { offset?: number; limitBytes?: number } = {}) {
  const root = captureRoot();
  const filePath = writeCapture(root, 'combined.log', content);
  return { root, filePath, result: await readCaptureSlice({ path: filePath, ...options }, root) };
}

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  roots.length = 0;
  fs.rmSync(envMock.SERO_CAPTURE_ROOT, { recursive: true, force: true });
});

describe('readCaptureSlice', () => {
  it('returns the whole file when it fits in one slice', async () => {
    const { result } = await readSlice('hello\nworld\n');

    expect(result).toEqual({ state: 'ok', content: 'hello\nworld\n', totalBytes: 12 });
  });

  it('pages a large file and never exceeds the requested slice', async () => {
    const content = `${'a'.repeat(5000)}\n`;
    const { result: first, root, filePath } = await readSlice(content, { limitBytes: 1000 });

    expect(first.state).toBe('ok');
    expect(first.content).toHaveLength(1000);
    expect(first.nextOffset).toBe(1000);
    expect(first.totalBytes).toBe(5001);

    const second = await readCaptureSlice({ path: filePath, offset: first.nextOffset, limitBytes: 1000 }, root);
    expect(second.state).toBe('ok');
    expect(second.content).toHaveLength(1000);
    expect(second.nextOffset).toBe(2000);

    // Without an explicit limit each call falls back to the default slice size.
    const third = await readCaptureSlice({ path: filePath, offset: second.nextOffset }, root);
    expect(third).toMatchObject({ state: 'ok', totalBytes: 5001 });
    expect(third.nextOffset).toBeUndefined();

    const last = await readCaptureSlice({ path: filePath, offset: 5000 }, root);
    expect(last).toEqual({ state: 'ok', content: '\n', totalBytes: 5001 });
  });

  it('returns empty content with no next offset at the end of a file', async () => {
    const { result, root, filePath } = await readSlice('abc', { offset: 3 });

    expect(result).toEqual({ state: 'ok', content: '', totalBytes: 3 });
    expect(await readCaptureSlice({ path: filePath, offset: 99 }, root)).toEqual({
      state: 'ok', content: '', totalBytes: 3,
    });
  });

  it('caps a slice at the hard maximum', async () => {
    const root = captureRoot();
    const filePath = writeCapture(root, 'combined.log', 'x'.repeat(MAX_CAPTURE_READ_BYTES + 2048));

    const result = await readCaptureSlice({ path: filePath, limitBytes: MAX_CAPTURE_READ_BYTES * 8 }, root);

    expect(result.content).toHaveLength(MAX_CAPTURE_READ_BYTES);
    expect(result.nextOffset).toBe(MAX_CAPTURE_READ_BYTES);
  });

  it('defaults the slice size when none is requested', async () => {
    const root = captureRoot();
    const filePath = writeCapture(root, 'combined.log', 'y'.repeat(DEFAULT_CAPTURE_READ_BYTES + 10));

    const result = await readCaptureSlice({ path: filePath }, root);

    expect(result.content).toHaveLength(DEFAULT_CAPTURE_READ_BYTES);
  });

  it('cuts a slice on a UTF-8 boundary so paging cannot inject a replacement character', async () => {
    const root = captureRoot();
    const filePath = writeCapture(root, 'stdout.log', '😀😀😀'); // 4 bytes each

    const first = await readCaptureSlice({ path: filePath, limitBytes: 5 }, root);
    const second = await readCaptureSlice({ path: filePath, offset: first.nextOffset }, root);

    expect(first.content).toBe('😀');
    expect(first.nextOffset).toBe(4);
    expect(`${first.content}${second.content}`).toBe('😀😀😀');
    expect(`${first.content}${second.content}`).not.toContain('\uFFFD');
  });

  it('reports an unavailable result when the file is gone', async () => {
    const root = captureRoot();
    const result = await readCaptureSlice({ path: path.join(root, 'session-a', 'capture-1', 'combined.log') }, root);

    expect(result.state).toBe('unavailable');
    expect(result.content).toBe('');
    expect(result.reason).toContain('no longer available');
  });

  it('reports an unavailable result when the path is a directory', async () => {
    const root = captureRoot();
    const directory = path.join(root, 'session-a', 'capture-1');
    fs.mkdirSync(directory, { recursive: true });

    const result = await readCaptureSlice({ path: directory }, root);

    expect(result.state).toBe('unavailable');
    expect(result.reason).toContain('not a file');
  });

  it('refuses a path outside the capture root', async () => {
    const root = captureRoot();
    const outside = path.join(os.tmpdir(), `sero-outside-${process.pid}.txt`);
    fs.writeFileSync(outside, 'secret', 'utf8');
    roots.push(outside);

    await expect(readCaptureSlice({ path: outside }, root)).rejects.toThrow(/outside the capture root/);
  });

  it('refuses a traversal path that escapes the capture root', async () => {
    const root = captureRoot();

    await expect(readCaptureSlice({ path: path.join(root, '..', 'escape.log') }, root)).rejects.toThrow(
      /outside the capture root/,
    );
  });
});

describe('registerToolCaptureHandlers', () => {
  it('serves a capture through the capture channel from the configured root', async () => {
    fs.mkdirSync(envMock.SERO_CAPTURE_ROOT, { recursive: true });
    const filePath = writeCapture(envMock.SERO_CAPTURE_ROOT, 'combined.log', 'served\n');

    const handle = vi.mocked(ipcMain.handle);
    handle.mockClear();
    registerToolCaptureHandlers();

    expect(handle).toHaveBeenCalledWith(IpcChannels.toolCapture.readCapture, expect.any(Function));
    const handler = handle.mock.calls[0]?.[1] as (
      event: unknown,
      request: ToolCaptureReadRequest,
    ) => Promise<ToolCaptureReadResult>;

    await expect(handler({}, { path: filePath })).resolves.toMatchObject({
      state: 'ok',
      content: 'served\n',
    });
  });
});
