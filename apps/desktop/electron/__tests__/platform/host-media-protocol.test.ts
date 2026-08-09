import { promises as fs } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agentDir: `/tmp/sero-host-media-${process.pid}`,
  protocolHandler: null as ((request: Request) => Promise<Response>) | null,
}));

vi.mock('electron', () => ({
  protocol: {
    handle: vi.fn((_scheme: string, handler: (request: Request) => Promise<Response>) => {
      mocks.protocolHandler = handler;
    }),
  },
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: mocks.agentDir,
}));

import { setupHostMediaProtocol } from '@electron/platform/protocols/host-media-protocol';

function jpegBytes(): Buffer {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0x64,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

describe('host media protocol', () => {
  beforeEach(async () => {
    await fs.rm(mocks.agentDir, { recursive: true, force: true });
    await fs.mkdir(mocks.agentDir, { recursive: true });
    mocks.protocolHandler = null;
  });

  it('serves the dashboard background with a byte-derived content type and no cache', async () => {
    const jpeg = jpegBytes();
    await fs.writeFile(path.join(mocks.agentDir, 'dashboard-background.image'), jpeg);
    setupHostMediaProtocol();

    const response = await mocks.protocolHandler!(
      new Request('sero-media://dashboard/background?v=1'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(jpeg);
  });

  it('maps a delete race to a 404 response', async () => {
    await fs.writeFile(path.join(mocks.agentDir, 'dashboard-background.image'), jpegBytes());
    setupHostMediaProtocol();
    const readFile = vi.spyOn(fs, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    try {
      const response = await mocks.protocolHandler!(
        new Request('sero-media://dashboard/background?v=1'),
      );
      expect(response.status).toBe(404);
    } finally {
      readFile.mockRestore();
    }
  });

  it('does not expose other profile files', async () => {
    await fs.writeFile(path.join(mocks.agentDir, 'layout.json'), '{}');
    setupHostMediaProtocol();

    const response = await mocks.protocolHandler!(
      new Request('sero-media://dashboard/../layout.json'),
    );

    expect(response.status).toBe(404);
  });
});
