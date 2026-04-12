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
    clientId: `test-${Date.now()}`,
  });

  expect(response).toEqual({ type: 'ok', requestType: 'connect' });
  return ws;
}

function createAgentOps(): GatewayAgentOps {
  const workspaces = [
    { id: 'workspace-a', name: 'Workspace A', path: '/workspace-a' },
    { id: 'workspace-b', name: 'Workspace B', path: '/workspace-b' },
  ];
  const sessionWorkspaceIds = new Map([
    ['session-a', 'workspace-a'],
    ['session-b', 'workspace-b'],
  ]);
  const sessionsByWorkspace = new Map([
    ['workspace-a', [{ id: 'session-a', name: 'Session A', firstMessage: 'hello from A' }]],
    ['workspace-b', [{ id: 'session-b', name: 'Session B', firstMessage: 'hello from B' }]],
  ]);
  const historyBySession = new Map<string, Array<{
    id: string;
    type: 'user' | 'assistant' | 'system';
    text: string;
    timestamp: number;
  }>>([
    ['session-a', [{ id: 'msg-a', type: 'user', text: 'hello a', timestamp: 1 }]],
    ['session-b', [{ id: 'msg-b', type: 'user', text: 'hello b', timestamp: 2 }]],
  ]);
  const artifactsBySession = new Map([
    ['session-a', [{
      id: 'artifact-a-1',
      type: 'image',
      title: 'Artifact A',
      timestamp: '2026-04-12T00:00:00.000Z',
      mimeType: 'image/png',
    }]],
    ['session-b', [{
      id: 'artifact-b-1',
      type: 'image',
      title: 'Artifact B',
      timestamp: '2026-04-12T00:00:00.000Z',
      mimeType: 'image/png',
    }]],
  ]);
  const artifactContents = new Map([
    ['artifact-a-1', { base64: 'AAAA', mimeType: 'image/png', title: 'Artifact A' }],
    ['artifact-b-1', { base64: 'BBBB', mimeType: 'image/png', title: 'Artifact B' }],
  ]);

  function assertSessionWorkspace(workspaceId: string, sessionId: string): void {
    const actualWorkspaceId = sessionWorkspaceIds.get(sessionId);
    if (!actualWorkspaceId) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (actualWorkspaceId !== workspaceId) {
      throw new Error(`Session ${sessionId} is bound to workspace ${actualWorkspaceId}, not ${workspaceId}`);
    }
  }

  return {
    openSession: async (sessionId, workspaceId) => {
      const existingWorkspaceId = sessionWorkspaceIds.get(sessionId);
      if (existingWorkspaceId && existingWorkspaceId !== workspaceId) {
        throw new Error(`Session ${sessionId} is bound to workspace ${existingWorkspaceId}, not ${workspaceId}`);
      }
      sessionWorkspaceIds.set(sessionId, workspaceId);
      if (!sessionsByWorkspace.has(workspaceId)) {
        sessionsByWorkspace.set(workspaceId, []);
      }
    },
    prompt: async () => {},
    steer: async () => {},
    abort: async () => {},
    listWorkspaces: async () => workspaces,
    listSessions: async (workspaceId) => sessionsByWorkspace.get(workspaceId) ?? [],
    createSession: async (workspaceId, name) => {
      const sessionId = `created-${workspaceId}`;
      sessionWorkspaceIds.set(sessionId, workspaceId);
      const sessions = sessionsByWorkspace.get(workspaceId) ?? [];
      sessionsByWorkspace.set(workspaceId, [...sessions, { id: sessionId, name: name ?? '', firstMessage: '' }]);
      historyBySession.set(sessionId, []);
      return { id: sessionId, name: name ?? '' };
    },
    listFiles: async () => [],
    readFile: async () => ({ content: '', encoding: 'utf8', mimeType: 'text/plain', size: 0 }),
    listArtifacts: async (sessionId) => artifactsBySession.get(sessionId) ?? [],
    getArtifact: async (artifactId) => artifactContents.get(artifactId) ?? null,
    getSessionHistory: async (workspaceId, sessionId) => {
      assertSessionWorkspace(workspaceId, sessionId);
      return historyBySession.get(sessionId) ?? [];
    },
  };
}

async function createHarness(): Promise<TestHarness> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gateway-integration-test-'));
  const server = new GatewayServer({
    port: 0,
    host: '127.0.0.1',
    tokenPath: path.join(tmpDir, 'gateway-token.txt'),
    configDir: tmpDir,
  });
  server.setAgentOps(createAgentOps());
  await server.start();

  const port = Number((server as any).httpServer?.address()?.port);
  if (!port) {
    throw new Error('Failed to determine gateway test port');
  }

  return { server, port, tmpDir };
}

describe('GatewayServer scoped authorization flows', () => {
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

  it('restricts scoped tokens to authorized workspaces across session and artifact flows', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const scopedToken = harness.server.getAuth().webTokens.create(['workspace-a'], 'Workspace A only').token;
    const ws = await connectClient(harness.port, scopedToken);
    sockets.push(ws);

    const workspaces = await sendRequest<GatewayResponse>(ws, { type: 'list_workspaces' });
    expect(workspaces).toEqual({
      type: 'ok',
      requestType: 'list_workspaces',
      data: [{ id: 'workspace-a', name: 'Workspace A', path: '/workspace-a' }],
    });

    const sessions = await sendRequest<GatewayResponse>(ws, {
      type: 'list_sessions',
      workspaceId: 'workspace-a',
    });
    expect(sessions).toEqual({
      type: 'ok',
      requestType: 'list_sessions',
      data: [{ id: 'session-a', name: 'Session A', firstMessage: 'hello from A' }],
    });

    const steerOk = await sendRequest<GatewayResponse>(ws, {
      type: 'steer',
      sessionId: 'session-a',
      text: 'continue',
    });
    expect(steerOk).toEqual({ type: 'ok', requestType: 'steer' });

    const abortOk = await sendRequest<GatewayResponse>(ws, {
      type: 'abort',
      sessionId: 'session-a',
    });
    expect(abortOk).toEqual({ type: 'ok', requestType: 'abort' });

    const history = await sendRequest<GatewayResponse>(ws, {
      type: 'get_session_history',
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
    });
    expect(history).toEqual({
      type: 'ok',
      requestType: 'get_session_history',
      data: [{ id: 'msg-a', type: 'user', text: 'hello a', timestamp: 1 }],
    });

    const artifactEventPromise = waitForMessage<GatewayPushEvent>(ws);
    harness.server.broadcastEvent({
      type: 'artifact_added',
      sessionId: 'session-a',
      artifactId: 'artifact-a-1',
      artifactType: 'image',
      title: 'Artifact A',
    });
    expect(await artifactEventPromise).toEqual({
      type: 'artifact_added',
      sessionId: 'session-a',
      artifactId: 'artifact-a-1',
      artifactType: 'image',
      title: 'Artifact A',
    });

    const artifact = await sendRequest<GatewayResponse>(ws, {
      type: 'get_artifact',
      artifactId: 'artifact-a-1',
    });
    expect(artifact).toEqual({
      type: 'ok',
      requestType: 'get_artifact',
      data: { base64: 'AAAA', mimeType: 'image/png', title: 'Artifact A' },
    });

    const foreignWorkspace = await sendRequest<GatewayResponse>(ws, {
      type: 'list_sessions',
      workspaceId: 'workspace-b',
    });
    expect(foreignWorkspace).toEqual({
      type: 'error',
      requestType: 'list_sessions',
      message: 'Workspace not authorized: workspace-b',
    });

    const foreignHistory = await sendRequest<GatewayResponse>(ws, {
      type: 'get_session_history',
      workspaceId: 'workspace-a',
      sessionId: 'session-b',
    });
    expect(foreignHistory).toEqual({
      type: 'error',
      requestType: 'get_session_history',
      message: 'Session session-b is bound to workspace workspace-b, not workspace-a',
    });

    const foreignSteer = await sendRequest<GatewayResponse>(ws, {
      type: 'steer',
      sessionId: 'session-b',
      text: 'nope',
    });
    expect(foreignSteer).toEqual({
      type: 'error',
      requestType: 'steer',
      message: 'Session not authorized: session-b',
    });
  });

  it('allows master tokens to authorize and access sessions across workspaces', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const ws = await connectClient(harness.port, harness.server.getToken());
    sockets.push(ws);

    const workspaces = await sendRequest<GatewayResponse>(ws, { type: 'list_workspaces' });
    expect(workspaces).toEqual({
      type: 'ok',
      requestType: 'list_workspaces',
      data: [
        { id: 'workspace-a', name: 'Workspace A', path: '/workspace-a' },
        { id: 'workspace-b', name: 'Workspace B', path: '/workspace-b' },
      ],
    });

    const sessions = await sendRequest<GatewayResponse>(ws, {
      type: 'list_sessions',
      workspaceId: 'workspace-b',
    });
    expect(sessions).toEqual({
      type: 'ok',
      requestType: 'list_sessions',
      data: [{ id: 'session-b', name: 'Session B', firstMessage: 'hello from B' }],
    });

    const history = await sendRequest<GatewayResponse>(ws, {
      type: 'get_session_history',
      workspaceId: 'workspace-b',
      sessionId: 'session-b',
    });
    expect(history).toEqual({
      type: 'ok',
      requestType: 'get_session_history',
      data: [{ id: 'msg-b', type: 'user', text: 'hello b', timestamp: 2 }],
    });

    const steer = await sendRequest<GatewayResponse>(ws, {
      type: 'steer',
      sessionId: 'session-b',
      text: 'continue',
    });
    expect(steer).toEqual({ type: 'ok', requestType: 'steer' });

    const artifactEventPromise = waitForMessage<GatewayPushEvent>(ws);
    harness.server.broadcastEvent({
      type: 'artifact_added',
      sessionId: 'session-b',
      artifactId: 'artifact-b-1',
      artifactType: 'image',
      title: 'Artifact B',
    });
    expect(await artifactEventPromise).toEqual({
      type: 'artifact_added',
      sessionId: 'session-b',
      artifactId: 'artifact-b-1',
      artifactType: 'image',
      title: 'Artifact B',
    });

    const artifact = await sendRequest<GatewayResponse>(ws, {
      type: 'get_artifact',
      artifactId: 'artifact-b-1',
    });
    expect(artifact).toEqual({
      type: 'ok',
      requestType: 'get_artifact',
      data: { base64: 'BBBB', mimeType: 'image/png', title: 'Artifact B' },
    });
  });
});
