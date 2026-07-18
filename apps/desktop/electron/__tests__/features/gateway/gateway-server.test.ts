import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { WebSocket } from 'ws';

import { GatewayServer } from '@electron/features/gateway';

describe('GatewayServer artifact authorization', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('authorizes artifact IDs from artifact_added push events for subscribed clients', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gateway-server-test-'));

    const server = new GatewayServer({
      port: 18800,
      previewPort: 0,
      host: '127.0.0.1',
      tokenPath: path.join(tmpDir, 'gateway-token.txt'),
      configDir: tmpDir,
    });

    const authorizedWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const unauthorizedWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const authorizedClient = {
      ws: authorizedWs,
      clientType: 'web',
      clientId: 'authorized',
      authenticated: true,
      isMasterAuth: false,
      authorizedWorkspaceIds: new Set(['workspace-1']),
      authorizedSessions: new Map([['session-1', 'workspace-1']]),
      authorizedArtifacts: new Map<string, string>(),
      subscribedSessions: new Set(['session-1']),
      remoteIp: '127.0.0.1',
      lastActivity: Date.now(),
    };

    const unauthorizedClient = {
      ws: unauthorizedWs,
      clientType: 'web',
      clientId: 'unauthorized',
      authenticated: true,
      isMasterAuth: false,
      authorizedWorkspaceIds: new Set(['workspace-1']),
      authorizedSessions: new Map<string, string>(),
      authorizedArtifacts: new Map<string, string>(),
      subscribedSessions: new Set(['session-1']),
      remoteIp: '127.0.0.1',
      lastActivity: Date.now(),
    };

    (server as any).clients.set(authorizedWs, authorizedClient);
    (server as any).clients.set(unauthorizedWs, unauthorizedClient);

    server.pushEvent('session-1', {
      type: 'artifact_added',
      sessionId: 'session-1',
      artifactId: 'artifact-1',
      artifactType: 'image',
      title: 'Screenshot',
    });

    expect(authorizedClient.authorizedArtifacts.has('artifact-1')).toBe(true);
    expect(authorizedWs.send).toHaveBeenCalledOnce();
    expect(unauthorizedClient.authorizedArtifacts.has('artifact-1')).toBe(false);
    expect(unauthorizedWs.send).not.toHaveBeenCalled();
  });
});
