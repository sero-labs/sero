import { promises as fs } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => ({
  agentDir: `/tmp/sero-dashboard-background-${process.pid}`,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  broadcastToWindows: vi.fn(),
  resizeImageForApi: vi.fn((data: string, mimeType: string) => ({
    data,
    mimeType,
    originalWidth: 100,
    originalHeight: 100,
    width: 100,
    height: 100,
    wasResized: false,
  })),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
  nativeImage: {
    createFromDataURL: vi.fn((dataUrl: string) => ({
      isEmpty: () => false,
      toPNG: () => Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'),
    })),
  },
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: mocks.agentDir,
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: mocks.broadcastToWindows,
}));

vi.mock('@electron/shared/media/image-resize', () => ({
  resizeImageForApi: mocks.resizeImageForApi,
}));

import { registerLayoutHandlers } from '@electron/ipc/workspace/layout';

const sender = { send: vi.fn() };
const event = { sender };

function dataUrl(mimeType: 'image/png' | 'image/jpeg', content: string): string {
  return `data:${mimeType};base64,${Buffer.from(content).toString('base64')}`;
}

function handler(channel: string): (...args: unknown[]) => unknown {
  const registered = mocks.handlers.get(channel);
  if (!registered) throw new Error(`Missing IPC handler: ${channel}`);
  return registered;
}

async function readSavedBackground(extension: 'png' | 'jpg'): Promise<string> {
  return fs.readFile(path.join(mocks.agentDir, `dashboard-background.${extension}`), 'utf8');
}

describe('dashboard background IPC', () => {
  beforeAll(() => {
    registerLayoutHandlers();
  });

  beforeEach(async () => {
    await fs.rm(mocks.agentDir, { recursive: true, force: true });
    await fs.mkdir(mocks.agentDir, { recursive: true });
    sender.send.mockReset();
    mocks.broadcastToWindows.mockReset();
    mocks.resizeImageForApi.mockClear();
  });

  it('rejects WebP with the stable supported-format error', async () => {
    await expect(handler(IpcChannels.dashboard.setBackground)(
      event,
      'data:image/webp;base64,d2VicA==',
    )).rejects.toThrow('PNG or JPEG');
  });

  it('uses the shared image resizer and returns a protocol URL', async () => {
    mocks.resizeImageForApi.mockReturnValueOnce({
      data: Buffer.from('bounded').toString('base64'),
      mimeType: 'image/jpeg',
      originalWidth: 4000,
      originalHeight: 3000,
      width: 1920,
      height: 1440,
      wasResized: true,
    });

    await handler(IpcChannels.dashboard.setBackground)(event, dataUrl('image/jpeg', 'large-jpeg'));

    expect(mocks.resizeImageForApi).toHaveBeenCalledWith(
      Buffer.from('large-jpeg').toString('base64'),
      'image/jpeg',
      expect.objectContaining({
        maxBytes: expect.any(Number),
        maxWidth: expect.any(Number),
        maxHeight: expect.any(Number),
      }),
    );
    expect(await readSavedBackground('jpg')).toBe('bounded');
    await expect(handler(IpcChannels.dashboard.getBackground)(event)).resolves.toMatch(
      /^sero-media:\/\/dashboard\/background\.jpg\?v=/,
    );
  });

  it('broadcasts background changes to every window', async () => {
    await handler(IpcChannels.dashboard.setBackground)(event, dataUrl('image/png', 'pixels'));

    expect(mocks.broadcastToWindows).toHaveBeenCalledWith(
      IpcChannels.dashboard.backgroundChanged,
      expect.stringMatching(/^sero-media:\/\/dashboard\/background\.png\?v=/),
    );
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('serializes concurrent background writes', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1234);
    try {
      await expect(Promise.all([
        handler(IpcChannels.dashboard.setBackground)(event, dataUrl('image/png', 'first')),
        handler(IpcChannels.dashboard.setBackground)(event, dataUrl('image/png', 'second')),
      ])).resolves.toEqual([undefined, undefined]);
    } finally {
      now.mockRestore();
    }

    expect(await readSavedBackground('png')).toBe('second');
  });

  it('rejects non-string input with the validation error', async () => {
    await expect(handler(IpcChannels.dashboard.setBackground)(event, undefined)).rejects.toThrow(
      'Dashboard background must be a PNG or JPEG data URL',
    );
  });
});
