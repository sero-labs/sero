import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LspManager } from '@electron/features/editor/lsp/lsp-manager';
import type { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { RuntimeBackend, RuntimeExecInput, RuntimeExecResult } from '@electron/features/workspace/runtime/types';

const mocks = vi.hoisted(() => ({
  ensureCoreTools: vi.fn(),
  runtimeExec: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/install-actions', () => ({
  ensureCoreTools: mocks.ensureCoreTools,
}));

vi.mock('@electron/features/editor/lsp/lsp-process', () => ({
  LspServerProcess: class MockLspServerProcess {
    readonly initialized = false;
    readonly serverCapabilities = {};

    on(): this {
      return this;
    }

    start(): Promise<Record<string, unknown>> {
      return Promise.resolve({ textDocumentSync: 1 });
    }

    shutdown(): Promise<void> {
      return Promise.resolve();
    }

    sendRequest(): Promise<unknown> {
      return Promise.resolve(undefined);
    }

    sendNotification(): void {}
  },
}));

const ok = (): RuntimeExecResult => ({ stdout: '', stderr: '', exitCode: 0 });
const fail = (): RuntimeExecResult => ({ stdout: '', stderr: 'missing', exitCode: 1 });

describe('LspManager host core tools', () => {
  beforeEach(() => {
    mocks.ensureCoreTools.mockReset();
    mocks.runtimeExec.mockReset();
  });

  it('uses host runtime node/npm when direct managed status cannot see shell PATH tools', async () => {
    mocks.runtimeExec.mockImplementation(async (_input: RuntimeExecInput) => ok());
    mocks.ensureCoreTools.mockResolvedValue({
      state: 'missing',
      tools: [{ tool: 'npm', state: 'missing' }],
    });

    const manager = new LspManager(runtimeManager());

    await expect(manager.startServer('workspace-a', 'typescript')).resolves.toMatchObject({
      language: 'typescript',
      capabilities: { textDocumentSync: 1 },
    });
    expect(mocks.ensureCoreTools).not.toHaveBeenCalled();
    expect(mocks.runtimeExec).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.stringContaining('npm --version'),
    }));
  });

  it('includes installer failure details when host runtime tools are unavailable', async () => {
    mocks.runtimeExec.mockImplementation(async (_input: RuntimeExecInput) => fail());
    mocks.ensureCoreTools.mockResolvedValue({
      state: 'failed',
      tools: [{ tool: 'npm', state: 'missing' }],
      error: {
        code: 'TOOL_INSTALL_FAILED',
        message: 'download failed',
        retryable: true,
      },
    });

    const manager = new LspManager(runtimeManager());

    await expect(manager.startServer('workspace-a', 'typescript')).rejects.toThrow(/npm is missing.*download failed/);
  });
});

function runtimeManager(): RuntimeManager {
  const runtime = {
    backend: 'host',
    workspaceId: 'workspace-a',
    capabilities: { languageServers: true },
    exec: mocks.runtimeExec,
  } as unknown as RuntimeBackend;
  return { getRuntime: vi.fn(async () => runtime) } as unknown as RuntimeManager;
}
