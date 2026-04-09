import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeJavaScript, fakeWindow } = vi.hoisted(() => {
  const executeJavaScript = vi.fn();
  return {
    executeJavaScript,
    fakeWindow: { webContents: { executeJavaScript } },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [fakeWindow],
  },
}));

import { CliRegistry } from '../../cli/core/registry';
import { registerAppControlCliCommands } from '../../cli/commands/apps/app-control';
import type { CliCommandContext } from '../../cli/core/types';

function createContext(): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp/ws-1',
    invocation: {
      workspaceId: 'ws-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      source: 'tool',
    },
    workspaceManager: { getPath: () => '/tmp/ws-1' },
    containerManager: {} as never,
  } as unknown as CliCommandContext;
}

describe('app control CLI', () => {
  beforeEach(() => {
    executeJavaScript.mockReset();
  });

  it('rejects non-numeric inspect coordinates before hitting the renderer', async () => {
    const registry = new CliRegistry();
    registerAppControlCliCommands(registry);

    const result = await registry.get('app')?.execute(
      ['inspect', '--x', 'nope', '--y', '12'],
      createContext(),
    );

    expect(result).toEqual({ output: 'ERROR: --x and --y must be finite numbers.', exitCode: 1 });
    expect(executeJavaScript).not.toHaveBeenCalled();
  });

  it('rejects inspect calls that mix selector and point targeting', async () => {
    const registry = new CliRegistry();
    registerAppControlCliCommands(registry);

    const result = await registry.get('app')?.execute(
      ['inspect', '#save-button', '--x', '10', '--y', '12'],
      createContext(),
    );

    expect(result).toEqual({
      output: 'ERROR: Use either a selector or --x/--y coordinates for inspect, not both.',
      exitCode: 1,
    });
    expect(executeJavaScript).not.toHaveBeenCalled();
  });

  it('serializes successful inspect results as JSON text', async () => {
    executeJavaScript.mockResolvedValue({
      success: true,
      message: 'Inspection complete at (10, 12)',
      inspection: {
        mode: 'point',
        point: { x: 10, y: 12 },
        panelRect: { x: 20, y: 40, width: 320, height: 240 },
      },
    });

    const registry = new CliRegistry();
    registerAppControlCliCommands(registry);

    const result = await registry.get('app')?.execute(
      ['inspect', '--x', '10', '--y', '12'],
      createContext(),
    );

    expect(executeJavaScript).toHaveBeenCalledWith(
      'window.sero.appControl.interact({"action":"inspect","captureAfter":false,"x":10,"y":12})',
    );
    expect(result).toEqual({
      output: '{\n  "mode": "point",\n  "point": {\n    "x": 10,\n    "y": 12\n  },\n  "panelRect": {\n    "x": 20,\n    "y": 40,\n    "width": 320,\n    "height": 240\n  }\n}',
      exitCode: 0,
    });
  });
});
