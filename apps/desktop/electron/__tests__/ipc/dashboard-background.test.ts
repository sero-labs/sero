import { promises as fs } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => ({
  agentDir: `/tmp/sero-dashboard-background-${process.pid}`,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  broadcastToWindows: vi.fn(),
  resizeImageForApi: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      getSize: () => ({ width: 100, height: 100 }),
      isEmpty: () => false,
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

const event = { sender: { send: vi.fn() } };

function pngBytes(marker = 0): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(100, 16);
  buffer.writeUInt32BE(100, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  buffer[32] = marker;
  return buffer;
}

function jpegBytes(): Buffer {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0x64,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function imageDataUrl(declaredMimeType: 'image/png' | 'image/jpeg', bytes: Buffer): string {
  return `data:${declaredMimeType};base64,${bytes.toString('base64')}`;
}

function handler(channel: string): (...args: unknown[]) => unknown {
  const registered = mocks.handlers.get(channel);
  if (!registered) throw new Error(`Missing IPC handler: ${channel}`);
  return registered;
}

async function readSavedBackground(): Promise<Buffer> {
  return fs.readFile(path.join(mocks.agentDir, 'dashboard-background.image'));
}

describe('dashboard background IPC', () => {
  beforeAll(() => {
    registerLayoutHandlers();
  });

  beforeEach(async () => {
    await fs.rm(mocks.agentDir, { recursive: true, force: true });
    await fs.mkdir(mocks.agentDir, { recursive: true });
    event.sender.send.mockReset();
    mocks.broadcastToWindows.mockReset();
    mocks.resizeImageForApi.mockReset();
  });

  it('rejects WebP with the stable supported-format error', async () => {
    await expect(handler(IpcChannels.dashboard.setBackground)(
      event,
      'data:image/webp;base64,d2VicA==',
    )).rejects.toThrow('PNG or JPEG');
  });

  it('persists the original bytes without CPU-bound re-encoding', async () => {
    const bytes = pngBytes();
    await handler(IpcChannels.dashboard.setBackground)(
      event,
      imageDataUrl('image/png', bytes),
    );

    expect(mocks.resizeImageForApi).not.toHaveBeenCalled();
    expect(await readSavedBackground()).toEqual(bytes);
  });

  it('preserves transparent PNG bytes', async () => {
    const transparentPng = pngBytes(42);
    await handler(IpcChannels.dashboard.setBackground)(
      event,
      imageDataUrl('image/png', transparentPng),
    );

    expect(await readSavedBackground()).toEqual(transparentPng);
  });

  it('broadcasts a cache-safe media URL to every window', async () => {
    await handler(IpcChannels.dashboard.setBackground)(
      event,
      imageDataUrl('image/png', pngBytes()),
    );

    expect(mocks.broadcastToWindows).toHaveBeenCalledWith(
      IpcChannels.dashboard.backgroundChanged,
      expect.stringMatching(/^sero-media:\/\/dashboard\/background\?v=/),
    );
    expect(event.sender.send).not.toHaveBeenCalled();

    const firstUrl = await handler(IpcChannels.dashboard.getBackground)(event);
    const secondUrl = await handler(IpcChannels.dashboard.getBackground)(event);
    expect(firstUrl).not.toBe(secondUrl);
  });

  it('serializes concurrent background writes', async () => {
    const first = pngBytes(1);
    const second = pngBytes(2);
    await expect(Promise.all([
      handler(IpcChannels.dashboard.setBackground)(event, imageDataUrl('image/png', first)),
      handler(IpcChannels.dashboard.setBackground)(event, imageDataUrl('image/png', second)),
    ])).resolves.toEqual([undefined, undefined]);

    expect(await readSavedBackground()).toEqual(second);
  });

  it('does not run a second-file cleanup after a successful write', async () => {
    const remove = vi.spyOn(fs, 'rm');
    try {
      await handler(IpcChannels.dashboard.setBackground)(
        event,
        imageDataUrl('image/png', pngBytes()),
      );

      expect(remove).not.toHaveBeenCalled();
    } finally {
      remove.mockRestore();
    }
  });

  it('derives the stored image type from bytes instead of the data URL prefix', async () => {
    const jpeg = jpegBytes();
    await handler(IpcChannels.dashboard.setBackground)(
      event,
      imageDataUrl('image/png', jpeg),
    );

    expect(await readSavedBackground()).toEqual(jpeg);
  });

  it('rejects images above the dashboard dimension limit without encoding', async () => {
    const oversized = pngBytes();
    oversized.writeUInt32BE(3000, 16);

    await expect(handler(IpcChannels.dashboard.setBackground)(
      event,
      imageDataUrl('image/png', oversized),
    )).rejects.toThrow('2560 × 1600');
    expect(mocks.resizeImageForApi).not.toHaveBeenCalled();
  });

  it('does not hydrate a corrupted background asset', async () => {
    await fs.writeFile(
      path.join(mocks.agentDir, 'dashboard-background.image'),
      Buffer.from('corrupted image'),
    );

    expect(await handler(IpcChannels.dashboard.getBackground)(event)).toBeNull();
  });

  it('rejects non-string input with the validation error', async () => {
    await expect(handler(IpcChannels.dashboard.setBackground)(event, undefined)).rejects.toThrow(
      'Dashboard background must be a PNG or JPEG data URL',
    );
  });
});
