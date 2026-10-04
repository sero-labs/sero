import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openDevPreview: vi.fn(),
  captureUrlHeadless: vi.fn(),
  prepareToolImage: vi.fn(),
}));

vi.mock('@electron/features/apps/app-control/host-service', () => ({
  appControlHostService: { openDevPreview: mocks.openDevPreview },
}));

vi.mock('@electron/features/apps/app-control/headless-capture', () => ({
  captureUrlHeadless: mocks.captureUrlHeadless,
}));

vi.mock('@electron/shared/media/image-resize', () => ({
  prepareToolImage: mocks.prepareToolImage,
}));

import { handlePreview } from '@electron/cli/commands/apps/app-control-navigation';
import type { CliCommandContext } from '@electron/cli/core/types';

const tempDirs: string[] = [];

function context(cwd = tmpdir()): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd,
    invocation: { workspaceId: 'ws-1', sessionId: 's1', turnId: 't1', source: 'tool' },
  } as CliCommandContext;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('sero app preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareToolImage.mockReturnValue({
      data: 'optimized-image',
      mimeType: 'image/jpeg',
      text: '[Image optimized for API]',
    });
  });

  it('opens the visible preview when --headless is absent', async () => {
    mocks.openDevPreview.mockResolvedValue(true);

    const result = await handlePreview(['http://127.0.0.1:3000'], context());

    expect(mocks.openDevPreview).toHaveBeenCalledWith('http://127.0.0.1:3000');
    expect(mocks.captureUrlHeadless).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });

  it('captures headlessly and saves the PNG without touching the visible app', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sero-headless-preview-'));
    tempDirs.push(dir);
    mocks.captureUrlHeadless.mockResolvedValue({
      ok: true,
      base64: Buffer.from('png-bytes').toString('base64'),
      url: 'http://127.0.0.1:3000',
    });

    const result = await handlePreview(
      ['http://127.0.0.1:3000', '--headless', '--save', 'shot.png'],
      context(dir),
    );

    expect(mocks.captureUrlHeadless).toHaveBeenCalledWith('http://127.0.0.1:3000');
    expect(mocks.openDevPreview).not.toHaveBeenCalled();
    expect(await readFile(path.join(dir, 'shot.png'), 'utf8')).toBe('png-bytes');
    expect(result.details).toEqual({ savedPath: path.join(dir, 'shot.png') });
    expect(result.content?.at(-1)).toEqual({
      type: 'image',
      data: 'optimized-image',
      mimeType: 'image/jpeg',
    });
  });

  it('takes the URL from a flag-first form, because a bare flag grabs the next token', async () => {
    mocks.captureUrlHeadless.mockResolvedValue({
      ok: true,
      base64: Buffer.from('png-bytes').toString('base64'),
      url: 'http://127.0.0.1:3000',
    });

    const result = await handlePreview(['--headless', 'http://127.0.0.1:3000'], context());

    expect(mocks.captureUrlHeadless).toHaveBeenCalledWith('http://127.0.0.1:3000');
    expect(result.exitCode).toBe(0);
  });

  it('refuses a bare --save instead of returning an image with no file', async () => {
    const result = await handlePreview(['http://127.0.0.1:3000', '--headless', '--save'], context());

    expect(result).toEqual({ output: 'ERROR: --save needs a path: --save <path>', exitCode: 1 });
    expect(mocks.captureUrlHeadless).not.toHaveBeenCalled();
  });

  it('refuses --save without --headless instead of writing nothing', async () => {
    const result = await handlePreview(['http://127.0.0.1:3000', '--save', 'shot.png'], context());

    expect(result.exitCode).toBe(1);
    expect(mocks.openDevPreview).not.toHaveBeenCalled();
    expect(mocks.captureUrlHeadless).not.toHaveBeenCalled();
  });

  it('reports a failed headless capture without falling back to the visible preview', async () => {
    mocks.captureUrlHeadless.mockResolvedValue({ ok: false, error: 'Timed out after 30s' });

    const result = await handlePreview(['http://127.0.0.1:3000', '--headless'], context());

    expect(result).toEqual({ output: 'ERROR: Headless preview failed: Timed out after 30s', exitCode: 1 });
    expect(mocks.openDevPreview).not.toHaveBeenCalled();
  });
});
