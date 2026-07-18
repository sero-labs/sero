import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { WebSocket, type RawData } from 'ws';

import { GatewayServer, type GatewayAgentOps } from '@electron/features/gateway';
import type { GatewayPushEvent, GatewayResponse } from '@electron/features/gateway/server/protocol';

interface TestHarness {
  server: GatewayServer;
  port: number;
  tmpDir: string;
  state: {
    addWorkspace: (workspaceId: string, name: string, fileContent: string) => void;
    getPromptCalls: () => Array<{ sessionId: string; text: string }>;
    getCreatedSessionId: (workspaceId: string) => string | null;
  };
}

interface GatewayMessageBase {
  type: string;
}

function waitForOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    ws.once('close', () => resolve());
  });
}

function waitForMessage<T extends GatewayMessageBase>(ws: WebSocket): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(new Error('Timed out waiting for gateway message'));
    }, 2000);

    const onMessage = (data: RawData) => {
      clearTimeout(timeout);
      ws.off('error', onError);
      resolve(JSON.parse(data.toString()) as T);
    };

    const onError = (error: Error) => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      reject(error);
    };

    ws.once('message', onMessage);
    ws.once('error', onError);
  });
}

async function sendRequest<T extends GatewayMessageBase>(ws: WebSocket, request: Record<string, unknown>): Promise<T> {
  const responsePromise = waitForMessage<T>(ws);
  ws.send(JSON.stringify(request));
  return responsePromise;
}

async function connectClient(port: number, token: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await waitForOpen(ws);

  const response = await sendRequest<GatewayResponse>(ws, {
    type: 'connect',
    token,
    clientType: 'web',
    clientId: `owner-${Date.now()}`,
  });

  expect(response).toEqual({ type: 'ok', requestType: 'connect' });
  return ws;
}

function createAgentOps(): TestHarness['state'] & { ops: GatewayAgentOps } {
  const workspaces = [
    { id: 'workspace-a', name: 'Workspace A', path: '/workspace-a' },
    { id: 'workspace-b', name: 'Workspace B', path: '/workspace-b' },
  ];
  const sessionsByWorkspace = new Map<string, Array<{ id: string; name: string; firstMessage: string }>>([
    ['workspace-a', []],
    ['workspace-b', []],
  ]);
  const historyBySession = new Map<string, Array<{ id: string; type: 'user'; text: string; timestamp: number }>>();
  const filesByWorkspace = new Map<string, { content: string; size: number }>([
    ['workspace-a', { content: '# A\n', size: 4 }],
    ['workspace-b', { content: '# B\n', size: 4 }],
  ]);
  const artifactsBySession = new Map<string, { base64: string; mimeType: string; title: string }>();
  const promptCalls: Array<{ sessionId: string; text: string }> = [];
  const createdSessionIds = new Map<string, string>();

  const addWorkspace = (workspaceId: string, name: string, fileContent: string) => {
    workspaces.push({ id: workspaceId, name, path: `/${workspaceId}` });
    sessionsByWorkspace.set(workspaceId, []);
    filesByWorkspace.set(workspaceId, { content: fileContent, size: Buffer.byteLength(fileContent, 'utf8') });
  };

  const ops: GatewayAgentOps = {
    openSession: async (sessionId, workspaceId) => {
      if (!sessionsByWorkspace.has(workspaceId)) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      if (!historyBySession.has(sessionId)) {
        historyBySession.set(sessionId, []);
      }
    },
    prompt: async (sessionId, text) => {
      promptCalls.push({ sessionId, text });
      const history = historyBySession.get(sessionId);
      if (!history) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      history.push({
        id: `msg-${history.length + 1}`,
        type: 'user',
        text,
        timestamp: history.length + 1,
      });
      artifactsBySession.set(sessionId, {
        base64: 'Q09OVEVOVA==',
        mimeType: 'image/png',
        title: `Artifact for ${sessionId}`,
      });
    },
    steer: async () => {},
    abort: async () => {},
    listWorkspaces: async () => workspaces,
    listSessions: async (workspaceId) => sessionsByWorkspace.get(workspaceId) ?? [],
    createSession: async (workspaceId, name) => {
      if (!sessionsByWorkspace.has(workspaceId)) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      const sessionId = `session-${workspaceId}-${(sessionsByWorkspace.get(workspaceId)?.length ?? 0) + 1}`;
      sessionsByWorkspace.get(workspaceId)?.push({ id: sessionId, name: name ?? '', firstMessage: '' });
      historyBySession.set(sessionId, []);
      createdSessionIds.set(workspaceId, sessionId);
      return { id: sessionId, name: name ?? '' };
    },
    listFiles: async (workspaceId) => {
      if (!filesByWorkspace.has(workspaceId)) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      return [{ name: 'README.md', type: 'file', path: '/README.md', size: filesByWorkspace.get(workspaceId)?.size ?? 0 }];
    },
    readFile: async (workspaceId) => {
      const file = filesByWorkspace.get(workspaceId);
      if (!file) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      return {
        content: file.content,
        encoding: 'utf8',
        mimeType: 'text/markdown',
        size: file.size,
      };
    },
    listArtifacts: async (sessionId) => {
      const artifact = artifactsBySession.get(sessionId);
      if (!artifact) return [];
      return [{
        id: `artifact-${sessionId}`,
        type: 'image',
        title: artifact.title,
        timestamp: '2026-04-17T00:00:00.000Z',
        mimeType: artifact.mimeType,
      }];
    },
    getArtifact: async (artifactId) => {
      const sessionId = artifactId.replace(/^artifact-/, '');
      return artifactsBySession.get(sessionId) ?? null;
    },
    getSessionHistory: async (_workspaceId, sessionId) => historyBySession.get(sessionId) ?? [],
    listDevServers: async () => [],
    resolveDevServerTarget: async () => null,
    onDevServerChange: () => () => {},
  };

  return {
    ops,
    addWorkspace,
    getPromptCalls: () => [...promptCalls],
    getCreatedSessionId: (workspaceId: string) => createdSessionIds.get(workspaceId) ?? null,
  };
}

async function createHarness(): Promise<TestHarness> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gateway-owner-token-test-'));
  const state = createAgentOps();
  const server = new GatewayServer({
    port: 0,
    previewPort: 0,
    previewTlsPort: 8443,
    host: '127.0.0.1',
    tokenPath: path.join(tmpDir, 'gateway-token.txt'),
    configDir: tmpDir,
  });
  server.setAgentOps(state.ops);
  await server.start();

  const port = Number((server as unknown as { httpServer?: { address(): { port?: number } | null } }).httpServer?.address()?.port);
  if (!port) {
    throw new Error('Failed to determine gateway test port');
  }

  return { server, port, tmpDir, state };
}

describe('GatewayServer owner web token flows', () => {
  const harnesses: TestHarness[] = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    await Promise.all(sockets.splice(0).map(async (ws) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        await waitForClose(ws);
      }
    }));

    await Promise.all(harnesses.splice(0).map(async ({ server, tmpDir }) => {
      await server.stop();
      await rm(tmpDir, { recursive: true, force: true });
    }));
  });

  it('keeps unrestricted owner tokens authorized for current and future workspaces across gateway operations', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const ownerToken = harness.server.getAuth().webTokens.create(null, 'Owner device').token;
    const ws = await connectClient(harness.port, ownerToken);
    sockets.push(ws);

    expect(await sendRequest<GatewayResponse>(ws, { type: 'list_workspaces' })).toEqual({
      type: 'ok',
      requestType: 'list_workspaces',
      data: [
        { id: 'workspace-a', name: 'Workspace A', path: '/workspace-a' },
        { id: 'workspace-b', name: 'Workspace B', path: '/workspace-b' },
      ],
    });

    harness.state.addWorkspace('workspace-c', 'Workspace C', '# C\n');

    expect(await sendRequest<GatewayResponse>(ws, { type: 'list_workspaces' })).toEqual({
      type: 'ok',
      requestType: 'list_workspaces',
      data: [
        { id: 'workspace-a', name: 'Workspace A', path: '/workspace-a' },
        { id: 'workspace-b', name: 'Workspace B', path: '/workspace-b' },
        { id: 'workspace-c', name: 'Workspace C', path: '/workspace-c' },
      ],
    });

    expect(await sendRequest<GatewayResponse>(ws, {
      type: 'create_session',
      workspaceId: 'workspace-c',
      name: 'Remote session',
    })).toEqual({
      type: 'ok',
      requestType: 'create_session',
      data: { id: 'session-workspace-c-1', name: 'Remote session' },
    });

    expect(await sendRequest<GatewayResponse>(ws, {
      type: 'list_sessions',
      workspaceId: 'workspace-c',
    })).toEqual({
      type: 'ok',
      requestType: 'list_sessions',
      data: [{ id: 'session-workspace-c-1', name: 'Remote session', firstMessage: '' }],
    });

    expect(await sendRequest<GatewayResponse>(ws, {
      type: 'prompt',
      workspaceId: 'workspace-c',
      sessionId: 'session-workspace-c-1',
      text: 'hello future workspace',
    })).toEqual({
      type: 'ok',
      requestType: 'prompt',
    });
    expect(harness.state.getPromptCalls()).toEqual([
      { sessionId: 'session-workspace-c-1', text: 'hello future workspace' },
    ]);

    expect(await sendRequest<GatewayResponse>(ws, {
      type: 'list_files',
      workspaceId: 'workspace-c',
      path: '/',
    })).toEqual({
      type: 'ok',
      requestType: 'list_files',
      data: {
        path: '/',
        entries: [{ name: 'README.md', type: 'file', path: '/README.md', size: 4 }],
      },
    });

    expect(await sendRequest<GatewayResponse>(ws, {
      type: 'read_file',
      workspaceId: 'workspace-c',
      path: '/README.md',
    })).toEqual({
      type: 'ok',
      requestType: 'read_file',
      data: {
        content: '# C\n',
        encoding: 'utf8',
        mimeType: 'text/markdown',
        size: 4,
      },
    });

    expect(await sendRequest<GatewayResponse>(ws, {
      type: 'get_session_history',
      workspaceId: 'workspace-c',
      sessionId: 'session-workspace-c-1',
    })).toEqual({
      type: 'ok',
      requestType: 'get_session_history',
      data: [{ id: 'msg-1', type: 'user', text: 'hello future workspace', timestamp: 1 }],
    });

    const textDeltaPromise = waitForMessage<GatewayPushEvent>(ws);
    harness.server.pushEvent('session-workspace-c-1', {
      type: 'text_delta',
      sessionId: 'session-workspace-c-1',
      delta: 'streamed owner token update',
    });
    expect(await textDeltaPromise).toEqual({
      type: 'text_delta',
      sessionId: 'session-workspace-c-1',
      delta: 'streamed owner token update',
    });

    const artifactEventPromise = waitForMessage<GatewayPushEvent>(ws);
    harness.server.broadcastEvent({
      type: 'artifact_added',
      sessionId: 'session-workspace-c-1',
      artifactId: 'artifact-session-workspace-c-1',
      artifactType: 'image',
      title: 'Artifact for session-workspace-c-1',
    });
    expect(await artifactEventPromise).toEqual({
      type: 'artifact_added',
      sessionId: 'session-workspace-c-1',
      artifactId: 'artifact-session-workspace-c-1',
      artifactType: 'image',
      title: 'Artifact for session-workspace-c-1',
    });

    expect(await sendRequest<GatewayResponse>(ws, {
      type: 'get_artifact',
      artifactId: 'artifact-session-workspace-c-1',
    })).toEqual({
      type: 'ok',
      requestType: 'get_artifact',
      data: {
        base64: 'Q09OVEVOVA==',
        mimeType: 'image/png',
        title: 'Artifact for session-workspace-c-1',
      },
    });

    expect(harness.state.getCreatedSessionId('workspace-c')).toBe('session-workspace-c-1');
  });
});
