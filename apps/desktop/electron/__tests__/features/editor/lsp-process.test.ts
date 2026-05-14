import { EventEmitter } from 'events';
import { mkdtemp, realpath, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LspServerProcess } from '@electron/features/editor/lsp/lsp-process';
import { fileUri, type LspServerConfig } from '@electron/features/editor/lsp/types';
import { createPosixHostSubstrate } from '@electron/features/workspace/runtime/backends/host/posix-substrate';
import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import { RUNTIME_WORKSPACE_PATH } from '@electron/features/workspace/runtime/runtime-paths';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFileMock,
  execFileSync: vi.fn(),
  spawn: mocks.spawnMock,
}));

class MockReadable extends EventEmitter {}

class MockSpawnedProcess extends EventEmitter {
  readonly pid = 1234;
  readonly stdout = new MockReadable();
  readonly stderr = new MockReadable();
  readonly stdin = {
    write: vi.fn(() => {
      this.stdout.emit('data', Buffer.from(encodeRpc({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } })));
      return true;
    }),
  };
}

const tempDirs: string[] = [];

const config: LspServerConfig = {
  language: 'typescript',
  command: 'typescript-language-server --stdio',
  checkCommand: 'which typescript-language-server',
  installCommand: 'npm install -g typescript-language-server',
  extensions: ['.ts'],
  monacoLanguageIds: ['typescript'],
  languageIdMap: { '.ts': 'typescript' },
};

function encodeRpc(message: object): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

describe('LspServerProcess host runtime launch', () => {
  beforeEach(() => {
    mocks.execFileMock.mockReset();
    mocks.spawnMock.mockReset();
  });

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('starts POSIX host language servers with host-visible roots and URI translation', async () => {
    const child = new MockSpawnedProcess();
    mocks.spawnMock.mockReturnValue(child);
    const workspacePath = await mkdtemp(path.join(os.tmpdir(), 'sero-lsp-posix-'));
    tempDirs.push(workspacePath);
    const backend = new HostBackend({
      workspaceId: 'workspace-a',
      hostWorkspacePath: workspacePath,
      substrate: createPosixHostSubstrate({ platform: 'darwin' }),
    });
    const server = new LspServerProcess('workspace-a', config, backend, {});

    await expect(server.start()).resolves.toEqual({});

    expect(mocks.spawnMock).toHaveBeenCalledWith('bash', ['-c', config.command], expect.objectContaining({
      cwd: await realpath(workspacePath),
      stdio: 'pipe',
    }));
    expect(child.stdin.write).toHaveBeenCalledWith(expect.stringContaining(`"rootPath":"${workspacePath}"`));

    server.sendNotification('textDocument/didOpen', {
      textDocument: { uri: `${fileUri(RUNTIME_WORKSPACE_PATH)}/src/example.ts` },
    });

    expect(child.stdin.write).toHaveBeenLastCalledWith(
      expect.stringContaining(`${fileUri(workspacePath)}/src/example.ts`),
    );

    const notification = new Promise((resolve) => server.once('notification', resolve));
    child.stdout.emit('data', Buffer.from(encodeRpc({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: { uri: `${fileUri(workspacePath)}/src/example.ts`, diagnostics: [] },
    })));

    await expect(notification).resolves.toMatchObject({
      params: { uri: `${fileUri(RUNTIME_WORKSPACE_PATH)}/src/example.ts` },
    });
  });

});
