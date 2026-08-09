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

describe('host media protocol', () => {
  beforeEach(async () => {
    await fs.rm(mocks.agentDir, { recursive: true, force: true });
    await fs.mkdir(mocks.agentDir, { recursive: true });
    mocks.protocolHandler = null;
  });

  it('serves the dashboard background with its image content type', async () => {
    await fs.writeFile(path.join(mocks.agentDir, 'dashboard-background.png'), Buffer.from('pixels'));
    setupHostMediaProtocol();

    const response = await mocks.protocolHandler!(
      new Request('sero-media://dashboard/background.png?v=1'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('pixels');
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
