import { describe, expect, it, vi } from 'vitest';
import type { IPty, IDisposable } from 'node-pty';
import { createTerminalSession } from '@electron/ipc/container/terminal-create';
import type { WorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/types';

interface FakePtyControl {
  pty: IPty;
  emitData(data: string): void;
}

describe('createTerminalSession', () => {
  it('creates a PTY through the runtime facade and returns the renderer contract', async () => {
    const fakePty = createFakePty();
    const runtime = createRuntimeFacade({
      actualRuntime: 'container',
      fallbackReason: 'container fallback reason',
      pty: fakePty.pty,
    });
    const createRuntimeFacadeMock = vi.fn(async () => runtime);
    const onData = vi.fn();

    const result = await createTerminalSession({
      workspaceId: 'ws-1',
      terminalId: 'term-1',
      cols: 120,
      rows: 40,
      onData,
      createRuntimeFacade: createRuntimeFacadeMock,
    });

    expect(createRuntimeFacadeMock).toHaveBeenCalledWith('ws-1');
    expect(runtime.createTerminal).toHaveBeenCalledWith({
      terminalId: 'term-1',
      cols: 120,
      rows: 40,
    });
    expect(result).toEqual({
      runtime: 'container',
      fallbackReason: 'container fallback reason',
    });

    fakePty.emitData('hello terminal');
    expect(onData).toHaveBeenCalledWith('hello terminal');
  });

  it('prefers a session fallback reason over the facade fallback reason', async () => {
    const fakePty = createFakePty();
    const runtime = createRuntimeFacade({
      actualRuntime: 'host',
      fallbackReason: 'facade fallback reason',
      sessionFallbackReason: 'session fallback reason',
      pty: fakePty.pty,
    });

    const result = await createTerminalSession({
      workspaceId: 'ws-1',
      terminalId: 'term-1',
      onData: vi.fn(),
      createRuntimeFacade: vi.fn(async () => runtime),
    });

    expect(result).toEqual({
      runtime: 'host',
      fallbackReason: 'session fallback reason',
    });
  });
});

function createFakePty(): FakePtyControl {
  let dataHandler: ((data: string) => void) | undefined;
  const disposable: IDisposable = { dispose: vi.fn() };
  const pty = {
    onData(handler: (data: string) => void): IDisposable {
      dataHandler = handler;
      return disposable;
    },
  } as IPty;

  return {
    pty,
    emitData(data: string) {
      dataHandler?.(data);
    },
  };
}

function createRuntimeFacade(input: {
  actualRuntime: 'host' | 'container';
  fallbackReason?: string;
  sessionFallbackReason?: string;
  pty: IPty;
}): WorkspaceRuntimeFacade {
  return {
    workspaceId: 'ws-1',
    workspacePath: '/tmp/ws',
    providerId: input.actualRuntime === 'container' ? 'apple-container' : 'host',
    actualRuntime: input.actualRuntime,
    fallbackReason: input.fallbackReason,
    capabilities: {
      exec: true,
      interactiveTerminal: true,
      directFileRead: input.actualRuntime === 'host',
      directFileWrite: input.actualRuntime === 'host',
      managedDevServers: input.actualRuntime === 'container',
      browserAutomation: input.actualRuntime === 'container',
      portDiscovery: input.actualRuntime === 'container',
    },
    resolution: {
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      desiredRuntime: 'container',
      actualRuntime: input.actualRuntime,
      containerEnabled: true,
      fallbackReason: input.fallbackReason,
      fallbackCode: input.fallbackReason ? 'container_unavailable' : undefined,
      capabilityAudit: [],
    },
    health: vi.fn(),
    exec: vi.fn(),
    createTerminal: vi.fn(async () => ({
      pty: input.pty,
      runtime: input.actualRuntime,
      fallbackReason: input.sessionFallbackReason,
    })),
  };
}
