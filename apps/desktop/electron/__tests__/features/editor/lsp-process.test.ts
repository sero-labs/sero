import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LspServerProcess } from '@electron/features/editor/lsp/lsp-process';
import type { LspServerConfig } from '@electron/features/editor/lsp/types';
import { createPosixHostSubstrate } from '@electron/features/workspace/runtime/backends/host/posix-substrate';
import { createWslHostSubstrate } from '@electron/features/workspace/runtime/backends/host/wsl-substrate';
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

  it('starts POSIX host language servers with the shared runtime workspace cwd', async () => {
    const child = new MockSpawnedProcess();
    mocks.spawnMock.mockReturnValue(child);
    const backend = new HostBackend({
      workspaceId: 'workspace-a',
      hostWorkspacePath: '/tmp/sero-lsp-posix',
      substrate: createPosixHostSubstrate({ platform: 'darwin' }),
    });
    const server = new LspServerProcess('workspace-a', config, backend, {});

    await expect(server.start()).resolves.toEqual({});

    expect(mocks.spawnMock).toHaveBeenCalledWith('bash', ['-c', config.command], expect.objectContaining({
      cwd: '/tmp/sero-lsp-posix',
      stdio: 'pipe',
    }));
    expect(child.stdin.write).toHaveBeenCalledWith(expect.stringContaining(`"rootPath":"${RUNTIME_WORKSPACE_PATH}"`));
  });

  it('starts WSL host language servers through wsl.exe with the translated runtime workspace cwd', async () => {
    const child = new MockSpawnedProcess();
    mocks.spawnMock.mockReturnValue(child);
    mocks.execFileMock.mockImplementation((_program, _args, cb) => cb(null, '5678\n', ''));
    const backend = new HostBackend({
      workspaceId: 'workspace-a',
      hostWorkspacePath: '\\\\wsl$\\Ubuntu\\home\\me\\repo',
      substrate: createWslHostSubstrate({
        workspacePath: '\\\\wsl$\\Ubuntu\\home\\me\\repo',
        supportsCd: true,
      }),
    });
    const server = new LspServerProcess('workspace-a', config, backend, {});

    await expect(server.start()).resolves.toEqual({});

    expect(mocks.spawnMock).toHaveBeenCalledWith('wsl.exe', expect.arrayContaining([
      '-d',
      'Ubuntu',
      '--cd',
      '/home/me/repo',
      '--',
      'bash',
      '-c',
    ]), expect.objectContaining({ stdio: 'pipe' }));
    expect(child.stdin.write).toHaveBeenCalledWith(expect.stringContaining(`"rootPath":"${RUNTIME_WORKSPACE_PATH}"`));
  });
});
