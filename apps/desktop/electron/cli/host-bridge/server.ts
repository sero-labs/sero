import http from 'http';
import path from 'path';

import { getCliRegistry } from '@electron/cli';
import { executeCliArgv } from '@electron/cli/core';
import { getCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { buildSessionRuntime } from '@electron/cli/core/invocation-context';
import type { CliCommandContext, CliInvocation } from '@electron/cli/core/types';
import { containerManager, workspaceManager } from '@electron/shared/infra/shared-infra';
import {
  clearSeroCliBridgeStateForTests,
  ensureSeroCliShim,
  getSeroCliBridgeConnection,
  getSeroCliBridgeTokenScope,
  setSeroCliBridgeConnection,
} from './state';

const MAX_BODY_BYTES = 1024 * 1024;

interface BridgeRequestBody {
  argv: string[];
  cwd?: string;
  workspaceId?: string | null;
  sessionId?: string | null;
}

let serverPromise: Promise<void> | null = null;
let server: http.Server | null = null;

export function ensureHostSeroCliBridge(): Promise<void> {
  if (getSeroCliBridgeConnection()) return Promise.resolve();
  if (serverPromise) return serverPromise;
  serverPromise = startBridge().catch((error: unknown) => {
    server?.close();
    server = null;
    serverPromise = null;
    throw error;
  });
  return serverPromise;
}

async function startBridge(): Promise<void> {
  await ensureSeroCliShim();
  server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Sero CLI bridge did not bind to a TCP port.');
  }

  setSeroCliBridgeConnection({
    endpoint: `http://127.0.0.1:${address.port}/cli`,
  });
}

export async function stopHostSeroCliBridgeForTests(): Promise<void> {
  const current = server;
  server = null;
  serverPromise = null;
  clearSeroCliBridgeStateForTests();
  if (!current) return;
  await new Promise<void>((resolve) => current.close(() => resolve()));
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/cli') {
    sendJson(res, 404, { output: 'Not found', exitCode: 1 });
    return;
  }
  const scope = authenticateBridgeRequest(req.headers.authorization);
  const workspacePath = scope ? workspaceManager.getPath(scope.workspaceId) : null;
  if (!scope || !workspacePath) {
    sendJson(res, 401, { output: 'Unauthorized', exitCode: 1 });
    return;
  }
  if (!isScopedSessionValid(scope.workspaceId, scope.sessionId)) {
    sendJson(res, 401, { output: 'Unauthorized session', exitCode: 1 });
    return;
  }

  try {
    const body = parseBridgeRequest(await readBody(req));
    const workspaceId = scope.workspaceId;
    const sessionId = scope.sessionId;
    const cwd = resolveBridgeCwd(body.cwd, workspacePath);
    if (!cwd) {
      sendJson(res, 403, { output: 'Forbidden cwd', exitCode: 1 });
      return;
    }
    const invocation = buildBridgeInvocation(workspaceId, sessionId);
    const context: CliCommandContext = {
      workspaceId,
      cwd,
      invocation,
      workspaceManager,
      containerManager,
      sessionRuntime: buildSessionRuntime({ workspaceId, invocation }),
    };
    const result = await executeCliArgv(getCliRegistry(), body.argv, context);
    sendJson(res, 200, { output: result.output, exitCode: result.exitCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 200, { output: `ERROR: ${message}`, exitCode: 1 });
  }
}

function buildBridgeInvocation(workspaceId: string, sessionId: string | null): CliInvocation {
  let turnId: string | null = null;
  if (sessionId) {
    try {
      turnId = getCliSessionBridge().getActiveTurnId(sessionId);
    } catch {
      turnId = null;
    }
  }
  return { workspaceId, sessionId, turnId, source: 'bash' };
}

function authenticateBridgeRequest(authorization: string | undefined) {
  const prefix = 'Bearer ';
  if (!authorization?.startsWith(prefix)) return null;
  return getSeroCliBridgeTokenScope(authorization.slice(prefix.length));
}

function isScopedSessionValid(workspaceId: string, sessionId: string | null): boolean {
  if (!sessionId) return true;
  try {
    const entry = getCliSessionBridge().getSessionEntry(sessionId);
    return entry?.workspaceId === workspaceId;
  } catch {
    return false;
  }
}

function resolveBridgeCwd(cwd: string | undefined, workspacePath: string): string | null {
  if (!cwd) return workspacePath;
  const root = path.resolve(workspacePath);
  const resolved = path.resolve(cwd);
  const relative = path.relative(root, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return resolved;
  return null;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += String(chunk);
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      throw new Error('Sero CLI request is too large.');
    }
  }
  return body;
}

function parseBridgeRequest(raw: string): BridgeRequestBody {
  const parsed = JSON.parse(raw) as Partial<BridgeRequestBody>;
  if (!Array.isArray(parsed.argv) || parsed.argv.some((arg) => typeof arg !== 'string')) {
    throw new Error('Invalid Sero CLI argv payload.');
  }
  return {
    argv: parsed.argv,
    cwd: typeof parsed.cwd === 'string' ? parsed.cwd : undefined,
    workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : null,
    sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
  };
}

function sendJson(res: http.ServerResponse, statusCode: number, body: { output: string; exitCode: number }): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}
