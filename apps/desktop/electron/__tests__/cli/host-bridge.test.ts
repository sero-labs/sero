import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCliRegistry, resetCliRegistryForTests } from '@electron/cli';
import { installCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { CliRegistry, executeCliArgv } from '@electron/cli/core';
import type { CliCommandContext } from '@electron/cli/core';
import { ensureHostSeroCliBridge, stopHostSeroCliBridgeForTests } from '@electron/cli/host-bridge/server';
import {
  addSeroCliEnv,
  clearSeroCliBridgeStateForTests,
  ensureSeroCliShim,
  getSeroCliBridgeTokenScope,
  mintSeroCliBridgeToken,
  setSeroCliBridgeConnection,
} from '@electron/cli/host-bridge/state';

vi.mock('@electron/shared/infra/shared-infra', () => ({
  containerManager: {},
  workspaceManager: {
    getPath: (workspaceId: string) => workspaceId === 'ws-1' ? '/tmp/ws-1' : workspaceId === 'ws-2' ? '/tmp/ws-2' : null,
    list: async () => [
      { id: 'ws-1', path: '/tmp/ws-1' },
      { id: 'ws-2', path: '/tmp/ws-2' },
    ],
  },
}));

async function postBridge(endpoint: string, token: string | null, body: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
}

function makeContext(): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp/workspace',
    invocation: {
      workspaceId: 'ws-1',
      sessionId: null,
      turnId: null,
      source: 'bash',
    },
    workspaceManager: {} as CliCommandContext['workspaceManager'],
    containerManager: {} as CliCommandContext['containerManager'],
  };
}

function installTestSessionBridge(entries: Record<string, string> = {}): void {
  installCliSessionBridge({
    getSessionEntry(sessionId) {
      const workspaceId = entries[sessionId];
      if (!workspaceId) return undefined;
      return {
        sessionId,
        workspaceId,
        session: {
          sendUserMessage: vi.fn(),
          sendCustomMessage: vi.fn(),
          setSessionName: vi.fn(),
        } as never,
      };
    },
    getActiveSessionForWorkspace() {
      return undefined;
    },
    getActiveTurnId() {
      return null;
    },
    noteTurnStart: vi.fn(),
    noteTurnEnd: vi.fn(),
    consumeTurnBudget: vi.fn(() => ({ allowed: true, count: 1, limit: 50 })),
    setSessionTitle: vi.fn(),
  });
}

describe('host Sero CLI bridge', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await stopHostSeroCliBridgeForTests();
    clearSeroCliBridgeStateForTests();
    resetCliRegistryForTests();
  });

  it('executes argv without re-tokenizing quoted values', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'echo',
      summary: 'Echo args',
      execute: async (args) => ({ output: JSON.stringify(args), exitCode: 0 }),
    });

    const result = await executeCliArgv(
      registry,
      ['echo', '--content', 'hello world', '--json', '{"a b":true}'],
      makeContext(),
    );

    expect(result).toEqual({
      output: '["--content","hello world","--json","{\\"a b\\":true}"]',
      exitCode: 0,
      content: undefined,
      details: undefined,
    });
  });

  it('prepends the managed Sero CLI bin and exports Sero context', () => {
    const env = addSeroCliEnv({ PATH: '/usr/bin' }, { workspaceId: 'ws-1', sessionId: 's-1' }, 'darwin');

    expect(env.PATH?.split(path.delimiter)[0]).toMatch(/\.sero-ui\/bin$/);
    expect(env.SERO_WORKSPACE_ID).toBe('ws-1');
    expect(env.SERO_SESSION_ID).toBe('s-1');
    expect(env.PI_CODING_AGENT_DIR).toBe(env.SERO_AGENT_DIR);
  });

  it('scopes bridge tokens to the managed workspace and session', () => {
    setSeroCliBridgeConnection({ endpoint: 'http://127.0.0.1:1234/cli' });

    const env = addSeroCliEnv({ PATH: '/usr/bin' }, { workspaceId: 'ws-1', sessionId: 's-1' }, 'darwin');

    expect(env.SERO_CLI_ENDPOINT).toBe('http://127.0.0.1:1234/cli');
    expect(env.SERO_CLI_TOKEN).toEqual(expect.any(String));
    expect(getSeroCliBridgeTokenScope(env.SERO_CLI_TOKEN ?? '')).toEqual({ workspaceId: 'ws-1', sessionId: 's-1' });
  });

  it('does not inject a bridge token without a workspace scope', () => {
    setSeroCliBridgeConnection({ endpoint: 'http://127.0.0.1:1234/cli' });

    const env = addSeroCliEnv({ PATH: '/usr/bin' }, {}, 'darwin');

    expect(env.SERO_CLI_ENDPOINT).toBeUndefined();
    expect(env.SERO_CLI_TOKEN).toBeUndefined();
  });

  it('expires stale bridge tokens and caps retained tokens', () => {
    const now = new Date('2026-05-17T00:00:00.000Z').getTime();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const expiringToken = mintSeroCliBridgeToken({ workspaceId: 'ws-1', sessionId: null });

    nowSpy.mockReturnValue(now + 5 * 60 * 1000 + 1);
    expect(getSeroCliBridgeTokenScope(expiringToken)).toBeNull();

    nowSpy.mockReturnValue(now);
    const firstToken = mintSeroCliBridgeToken({ workspaceId: 'ws-1', sessionId: null });
    for (let index = 0; index < 1024; index += 1) {
      mintSeroCliBridgeToken({ workspaceId: 'ws-1', sessionId: null });
    }

    expect(getSeroCliBridgeTokenScope(firstToken)).toBeNull();
  });

  it('rejects missing and unknown bearer tokens', async () => {
    await ensureHostSeroCliBridge();
    const endpoint = addSeroCliEnv({}, { workspaceId: 'ws-1' }).SERO_CLI_ENDPOINT;
    expect(endpoint).toEqual(expect.any(String));

    const missing = await postBridge(endpoint ?? '', null, { argv: ['help'], cwd: '/tmp/ws-1' });
    const unknown = await postBridge(endpoint ?? '', 'unknown-token', { argv: ['help'], cwd: '/tmp/ws-1' });

    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ output: 'Unauthorized', exitCode: 1 });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toMatchObject({ output: 'Unauthorized', exitCode: 1 });
  });

  it('rejects replayed single-use bridge tokens after first use', async () => {
    getCliRegistry().register({
      name: 'replay-test',
      summary: 'Replay test',
      execute: async () => ({ output: 'ok', exitCode: 0 }),
    });
    await ensureHostSeroCliBridge();
    const env = addSeroCliEnv({}, { workspaceId: 'ws-1' });

    const first = await postBridge(env.SERO_CLI_ENDPOINT ?? '', env.SERO_CLI_TOKEN ?? '', {
      argv: ['replay-test'],
      cwd: '/tmp/ws-1',
    });
    const replay = await postBridge(env.SERO_CLI_ENDPOINT ?? '', env.SERO_CLI_TOKEN ?? '', {
      argv: ['replay-test'],
      cwd: '/tmp/ws-1',
    });

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ output: 'ok', exitCode: 0 });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ output: 'Unauthorized', exitCode: 1 });
  });

  it('allows reusable bridge tokens for long-lived host terminal environments', async () => {
    getCliRegistry().register({
      name: 'terminal-token-test',
      summary: 'Terminal token test',
      execute: async () => ({ output: 'ok', exitCode: 0 }),
    });
    await ensureHostSeroCliBridge();
    const env = addSeroCliEnv({}, { workspaceId: 'ws-1', tokenMode: 'reusable' });

    const first = await postBridge(env.SERO_CLI_ENDPOINT ?? '', env.SERO_CLI_TOKEN ?? '', {
      argv: ['terminal-token-test'],
      cwd: '/tmp/ws-1',
    });
    const second = await postBridge(env.SERO_CLI_ENDPOINT ?? '', env.SERO_CLI_TOKEN ?? '', {
      argv: ['terminal-token-test'],
      cwd: '/tmp/ws-1',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toMatchObject({ output: 'ok', exitCode: 0 });
    expect(await second.json()).toMatchObject({ output: 'ok', exitCode: 0 });
  });

  it('uses token scope instead of spoofed payload workspace/session fields', async () => {
    installTestSessionBridge({ 's-1': 'ws-1' });
    getCliRegistry().register({
      name: 'bridge-scope-test',
      summary: 'Print bridge scope',
      execute: async (_args, context) => ({
        output: `${context.workspaceId}:${context.invocation.sessionId ?? 'none'}`,
        exitCode: 0,
      }),
    });
    await ensureHostSeroCliBridge();
    const env = addSeroCliEnv({}, { workspaceId: 'ws-1', sessionId: 's-1' });

    const response = await postBridge(env.SERO_CLI_ENDPOINT ?? '', env.SERO_CLI_TOKEN ?? '', {
      argv: ['bridge-scope-test'],
      cwd: '/tmp/ws-1',
      workspaceId: 'ws-2',
      sessionId: 's-2',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ output: 'ws-1:s-1', exitCode: 0 });
  });

  it('rejects stale or cross-workspace session-scoped bridge tokens', async () => {
    installTestSessionBridge({ 's-other': 'ws-2' });
    await ensureHostSeroCliBridge();

    const staleEnv = addSeroCliEnv({}, { workspaceId: 'ws-1', sessionId: 's-stale' });
    const stale = await postBridge(staleEnv.SERO_CLI_ENDPOINT ?? '', staleEnv.SERO_CLI_TOKEN ?? '', {
      argv: ['help'],
      cwd: '/tmp/ws-1',
    });
    expect(stale.status).toBe(401);

    const crossEnv = addSeroCliEnv({}, { workspaceId: 'ws-1', sessionId: 's-other' });
    const cross = await postBridge(crossEnv.SERO_CLI_ENDPOINT ?? '', crossEnv.SERO_CLI_TOKEN ?? '', {
      argv: ['help'],
      cwd: '/tmp/ws-1',
    });
    expect(cross.status).toBe(401);
  });

  it('rejects bridge cwd outside the authenticated workspace', async () => {
    getCliRegistry().register({
      name: 'cwd-test',
      summary: 'Print cwd',
      execute: async (_args, context) => ({ output: context.cwd, exitCode: 0 }),
    });
    await ensureHostSeroCliBridge();
    const env = addSeroCliEnv({}, { workspaceId: 'ws-1' });

    const response = await postBridge(env.SERO_CLI_ENDPOINT ?? '', env.SERO_CLI_TOKEN ?? '', {
      argv: ['cwd-test'],
      cwd: '/tmp/ws-2',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ output: 'Forbidden cwd', exitCode: 1 });
  });

  it('writes a managed sero executable shim', async () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-cli-shim-'));
    await ensureSeroCliShim({ binDir, platform: 'darwin' });

    const shim = path.join(binDir, 'sero');
    expect(fs.existsSync(shim)).toBe(true);
    expect(fs.readFileSync(shim, 'utf8')).toContain('SERO_CLI_ENDPOINT');
    execFileSync(process.execPath, ['--check', shim]);
    expect((fs.statSync(shim).mode & 0o111) !== 0).toBe(true);
  });
});
