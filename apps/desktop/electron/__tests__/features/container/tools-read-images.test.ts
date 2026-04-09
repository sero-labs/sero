import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareToolImage: vi.fn(),
}));

vi.mock('../../../shared/media/image-resize', () => ({
  prepareToolImage: mocks.prepareToolImage,
}));

import { createHostCodingTools } from '../../../features/container/tools';
import { createRead } from '../../../features/container/tools/tools-coding';

function getTool<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

describe('image read tool resizing', () => {
  const originalSeroHome = process.env.SERO_HOME;
  const pngBytes = Buffer.from('89504e470d0a1a0a00000000ff01', 'hex');

  beforeEach(() => {
    process.env.SERO_HOME = '/tmp/sero-home';
    mocks.prepareToolImage.mockReset();
    mocks.prepareToolImage.mockReturnValue({
      data: 'resized-base64',
      mimeType: 'image/jpeg',
      text: '[Image: original 4000x2000, displayed at 2000x1000. Multiply coordinates by 2.00 to map to original image.]',
      resize: {
        data: 'resized-base64',
        mimeType: 'image/jpeg',
        originalWidth: 4000,
        originalHeight: 2000,
        width: 2000,
        height: 1000,
        wasResized: true,
      },
    });
  });

  afterEach(() => {
    process.env.SERO_HOME = originalSeroHome;
    vi.restoreAllMocks();
  });

  it('applies Pi-style resize metadata to host read image attachments', async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'sero-host-read-image-'));
    const imagePath = path.join(workspaceDir, 'image.png');
    await writeFile(imagePath, pngBytes);

    try {
      const tools = createHostCodingTools(workspaceDir);
      const tool = getTool(tools, 'read');
      const result = await tool.execute('tool-host', { path: 'image.png' }, undefined, undefined, undefined as never);

      expect(mocks.prepareToolImage).toHaveBeenCalledWith(pngBytes.toString('base64'), 'image/png');
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Read image file [image/jpeg]\n[Image: original 4000x2000, displayed at 2000x1000. Multiply coordinates by 2.00 to map to original image.]',
          },
          { type: 'image', data: 'resized-base64', mimeType: 'image/jpeg' },
        ],
        details: { path: imagePath },
      });
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it('applies Pi-style resize metadata to container read image attachments', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: '/workspace/image.png\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '89504e470d0a1a0a00000000', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: `${pngBytes.toString('base64')}\n`, stderr: '', exitCode: 0 });

    const tool = createRead({ exec } as never, 'ws-1');
    const result = await tool.execute('tool-container', { path: 'image.png' }, undefined, undefined, undefined as never);

    expect(mocks.prepareToolImage).toHaveBeenCalledWith(pngBytes.toString('base64'), 'image/png');
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Read image file [image/jpeg]\n[Image: original 4000x2000, displayed at 2000x1000. Multiply coordinates by 2.00 to map to original image.]',
        },
        { type: 'image', data: 'resized-base64', mimeType: 'image/jpeg' },
      ],
      details: { path: '/workspace/image.png' },
    });
  });
});
