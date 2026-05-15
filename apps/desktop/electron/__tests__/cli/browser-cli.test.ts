import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliRegistry } from '@electron/cli/core/registry';
import { registerBrowserCliCommands } from '@electron/cli/commands/browser';
import type { CliCommandContext } from '@electron/cli/core/types';

const { browserMocks, appControlMocks } = vi.hoisted(() => ({
  browserMocks: {
    resolveActiveTabForWorkspace: vi.fn(),
    navigate: vi.fn(),
    openTabForHost: vi.fn(),
    listLoadedTabs: vi.fn(() => []),
    workspaceForTab: vi.fn(),
    closeTabForHost: vi.fn(),
    extractPage: vi.fn(),
    capturePage: vi.fn(),
  },
  appControlMocks: {
    showBrowserPanel: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@electron/features/browser/view-manager', () => ({
  browserViewManager: browserMocks,
}));

vi.mock('@electron/features/apps/app-control/host-service', () => ({
  appControlHostService: appControlMocks,
}));

function context(): CliCommandContext {
  return { workspaceId: 'ws-1' } as CliCommandContext;
}

describe('browser CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates the active tab with goto', async () => {
    browserMocks.resolveActiveTabForWorkspace.mockReturnValue('tab-1');
    const registry = new CliRegistry();
    registerBrowserCliCommands(registry);

    const result = await registry.get('browser')?.execute(['goto', 'https://example.com'], context());

    expect(appControlMocks.showBrowserPanel).toHaveBeenCalled();
    expect(browserMocks.navigate).toHaveBeenCalledWith('tab-1', 'https://example.com', 'ws-1');
    expect(browserMocks.openTabForHost).not.toHaveBeenCalled();
    expect(result).toEqual({ output: 'Navigating active tab tab-1 → https://example.com', exitCode: 0 });
  });

  it('shows the Browser panel without opening the Web app', async () => {
    const registry = new CliRegistry();
    registerBrowserCliCommands(registry);

    const result = await registry.get('browser')?.execute(['show'], context());

    expect(appControlMocks.showBrowserPanel).toHaveBeenCalled();
    expect(result).toEqual({
      output: 'Browser panel shown. Use `sero browser screenshot` to capture it; do not use `sero app screenshot --app web`.',
      exitCode: 0,
    });
  });

  it('opens a tab from goto when no browser tab is active', async () => {
    browserMocks.resolveActiveTabForWorkspace.mockReturnValue(null);
    browserMocks.openTabForHost.mockReturnValue('tab-new');
    const registry = new CliRegistry();
    registerBrowserCliCommands(registry);

    const result = await registry.get('browser')?.execute(['goto', 'https://example.com'], context());

    expect(browserMocks.openTabForHost).toHaveBeenCalledWith('https://example.com', 'ws-1');
    expect(result).toEqual({ output: 'Opened tab tab-new in workspace "ws-1" → https://example.com', exitCode: 0 });
  });
});
