import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import type { CliCommandContext } from '@electron/cli/core/types';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
    getRoots: vi.fn(),
    addRoot: vi.fn(),
    list: vi.fn(),
    getConfig: vi.fn(),
    getRuntimeConfig: vi.fn(),
    isContainerEnabled: vi.fn(),
    create: vi.fn(),
    addFolder: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  },
  appRuntimeManager: {
    reconcile: vi.fn(),
  },
  recreateContainerIfRunning: vi.fn(),
  broadcastToWindows: vi.fn(),
  askConfirm: vi.fn(),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  workspaceManager: mocks.workspaceManager,
  appRuntimeManager: mocks.appRuntimeManager,
}));
vi.mock('@electron/features/workspace/container-sync', () => ({
  recreateContainerIfRunning: mocks.recreateContainerIfRunning,
}));
vi.mock('@electron/cli/lib/ask-confirm', () => ({
  askConfirm: mocks.askConfirm,
}));
vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: mocks.broadcastToWindows,
}));

// Import AFTER the mocks so the mocked modules wire up correctly.
// Done lazily inside the test setup to avoid top-level await, which the
// electron tsconfig doesn't permit.
type WorkspaceCliModule = typeof import('@electron/cli/commands/workspace/workspace');
let registerWorkspaceCliCommands: WorkspaceCliModule['registerWorkspaceCliCommands'];

interface FakeRegistry {
  commands: Map<string, ReturnType<typeof vi.fn>>;
  register: ReturnType<typeof vi.fn>;
  invoke: (args: string[], ctx: CliCommandContext) => Promise<{ output: string; exitCode?: number }>;
}

function makeRegistry(): FakeRegistry {
  const commands = new Map<string, { execute: (args: string[], ctx: CliCommandContext) => Promise<unknown> }>();
  const register = vi.fn((cmd: { name: string; execute: (args: string[], ctx: CliCommandContext) => Promise<unknown> }) => {
    commands.set(cmd.name, cmd);
  });
  return {
    commands: commands as never,
    register,
    invoke: async (args, ctx) => {
      const cmd = commands.get('workspace');
      if (!cmd) throw new Error('workspace command not registered');
      return (await cmd.execute(args, ctx)) as { output: string; exitCode?: number };
    },
  };
}

function makeContext(overrides: Partial<CliCommandContext> = {}): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp',
    invocation: {
      workspaceId: 'ws-1',
      sessionId: null,
      turnId: null,
      source: 'tool',
    },
    workspaceManager: mocks.workspaceManager as never,
    containerManager: {} as never,
    ...overrides,
  };
}

describe('sero workspace mount-plugin', () => {
  let tmpRoot: string;
  let pluginDir: string;
  let registry: FakeRegistry;

  beforeAll(async () => {
    const mod = await import('@electron/cli/commands/workspace/workspace');
    registerWorkspaceCliCommands = mod.registerWorkspaceCliCommands;
  });

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-mount-plugin-test-'));
    pluginDir = path.join(tmpRoot, 'my-plugin');
    await mkdir(pluginDir);

    Object.values(mocks.workspaceManager).forEach((fn) => fn.mockReset());
    mocks.appRuntimeManager.reconcile.mockReset().mockResolvedValue(undefined);
    mocks.recreateContainerIfRunning.mockReset().mockResolvedValue(undefined);
    mocks.broadcastToWindows.mockReset();
    mocks.askConfirm.mockReset();

    mocks.workspaceManager.getPath.mockReturnValue('/host/ws');
    mocks.workspaceManager.getRoots.mockResolvedValue([]);
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'host' });

    registry = makeRegistry();
    registerWorkspaceCliCommands(registry as never);
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  async function writeValidPluginPkg() {
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({ sero: { app: { id: 'fancy', name: 'Fancy Plugin' } } }),
      'utf8',
    );
  }

  it('rejects when no path argument is given', async () => {
    const result = await registry.invoke(['mount-plugin'], makeContext());
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Usage:');
    expect(mocks.askConfirm).not.toHaveBeenCalled();
    expect(mocks.workspaceManager.addRoot).not.toHaveBeenCalled();
  });

  it('rejects with the validator error when the folder is not a Sero plugin', async () => {
    // No package.json in pluginDir
    const result = await registry.invoke(['mount-plugin', pluginDir], makeContext());
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/Not a Sero plugin/);
    expect(mocks.askConfirm).not.toHaveBeenCalled();
    expect(mocks.workspaceManager.addRoot).not.toHaveBeenCalled();
  });

  it('attaches the folder after the user confirms via the question UI', async () => {
    await writeValidPluginPkg();
    mocks.askConfirm.mockResolvedValue({ bridged: true, confirmed: true, cancelled: false });
    mocks.workspaceManager.addRoot.mockResolvedValue({
      id: 'my-plugin',
      name: 'my-plugin',
      path: pluginDir,
      kind: 'linked-plugin',
    });

    const result = await registry.invoke(['mount-plugin', pluginDir], makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/Attached folder/);
    expect(mocks.askConfirm).toHaveBeenCalledTimes(1);
    expect(mocks.askConfirm.mock.calls[0][0].prompt).toContain(pluginDir);
    expect(mocks.askConfirm.mock.calls[0][0].prompt).toContain('does not activate the plugin');
    expect(mocks.askConfirm.mock.calls[0][0].yesLabel).toBe('Attach folder');
    expect(mocks.workspaceManager.addRoot).toHaveBeenCalledWith('ws-1', {
      name: 'my-plugin',
      path: pluginDir,
      kind: 'linked-plugin',
    });
    expect(mocks.recreateContainerIfRunning).toHaveBeenCalledWith('ws-1');
    expect(mocks.broadcastToWindows).toHaveBeenCalledWith('sero:workspace:changed');
  });

  it('creates a new workspace and notifies the renderer', async () => {
    mocks.workspaceManager.create.mockResolvedValue({
      id: 'phoenix-shop',
      name: 'phoenix-shop',
      path: '/home/me/.sero-ui/workspaces/phoenix-shop',
    });

    const result = await registry.invoke(['create', 'phoenix-shop'], makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Created workspace: phoenix-shop (phoenix-shop)');
    expect(mocks.workspaceManager.create).toHaveBeenCalledWith('phoenix-shop', undefined);
    expect(mocks.appRuntimeManager.reconcile).toHaveBeenCalled();
    expect(mocks.broadcastToWindows).toHaveBeenCalledWith('sero:workspace:changed');
  });

  it('shows canonical runtime backend in workspace info', async () => {
    mocks.workspaceManager.getConfig.mockResolvedValue({ id: 'ws-1', name: 'Workspace 1' });
    mocks.workspaceManager.getRuntimeConfig.mockResolvedValue({ backend: 'docker' });

    const result = await registry.invoke(['info', 'ws-1'], makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Runtime backend: docker');
    expect(mocks.workspaceManager.getRuntimeConfig).toHaveBeenCalledWith('ws-1');
    expect(mocks.workspaceManager.isContainerEnabled).not.toHaveBeenCalled();
  });

  it('shows canonical runtime backend in workspace list', async () => {
    mocks.workspaceManager.list.mockResolvedValue([
      {
        id: 'ws-1',
        name: 'Workspace 1',
        path: '/host/ws',
        runtime: { backend: 'host' },
        container: false,
        open: true,
        references: [],
        mounts: [],
        roots: [],
      },
      {
        id: 'ws-2',
        name: 'Workspace 2',
        path: '/host/ws-2',
        runtime: { backend: 'apple-container' },
        container: true,
        open: true,
        references: [],
        mounts: [],
        roots: [],
      },
    ]);

    const result = await registry.invoke(['list'], makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('[host]');
    expect(result.output).toContain('[apple-container]');
  });

  it('passes --parent when creating a workspace', async () => {
    mocks.workspaceManager.create.mockResolvedValue({
      id: 'plugin-lab',
      name: 'plugin-lab',
      path: '/home/me/projects/plugin-lab',
    });

    await registry.invoke(['create', 'plugin-lab', '--parent', '/home/me/projects'], makeContext());

    expect(mocks.workspaceManager.create).toHaveBeenCalledWith('plugin-lab', '/home/me/projects');
  });

  it('surfaces an error when opening an unknown workspace', async () => {
    mocks.workspaceManager.open.mockRejectedValue(new Error('Workspace not found: atlas-notes'));

    const result = await registry.invoke(['open', 'atlas-notes'], makeContext());

    expect(result.exitCode).toBe(1);
    expect(result.output).toBe('ERROR: Workspace not found: atlas-notes');
    expect(mocks.broadcastToWindows).not.toHaveBeenCalled();
  });

  it('uses the --name flag as the display name', async () => {
    await writeValidPluginPkg();
    mocks.askConfirm.mockResolvedValue({ bridged: true, confirmed: true, cancelled: false });
    mocks.workspaceManager.addRoot.mockResolvedValue({
      id: 'fancy',
      name: 'Fancy',
      path: pluginDir,
      kind: 'linked-plugin',
    });

    await registry.invoke(
      ['mount-plugin', pluginDir, '--name', 'Fancy'],
      makeContext(),
    );

    expect(mocks.workspaceManager.addRoot).toHaveBeenCalledWith('ws-1', {
      name: 'Fancy',
      path: pluginDir,
      kind: 'linked-plugin',
    });
    expect(mocks.askConfirm.mock.calls[0][0].prompt).toContain('Fancy');
  });

  it('skips the confirmation prompt entirely when --yes is passed', async () => {
    await writeValidPluginPkg();
    mocks.workspaceManager.addRoot.mockResolvedValue({
      id: 'my-plugin',
      name: 'my-plugin',
      path: pluginDir,
      kind: 'linked-plugin',
    });

    const result = await registry.invoke(
      ['mount-plugin', pluginDir, '--yes'],
      makeContext(),
    );

    expect(result.exitCode).toBe(0);
    expect(mocks.askConfirm).not.toHaveBeenCalled();
    expect(mocks.workspaceManager.addRoot).toHaveBeenCalled();
    expect(mocks.recreateContainerIfRunning).toHaveBeenCalledWith('ws-1');
  });

  it('does NOT mount when the user cancels the confirmation', async () => {
    await writeValidPluginPkg();
    mocks.askConfirm.mockResolvedValue({
      bridged: true,
      confirmed: false,
      cancelled: true,
    });

    const result = await registry.invoke(['mount-plugin', pluginDir], makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/Cancelled/);
    expect(mocks.workspaceManager.addRoot).not.toHaveBeenCalled();
    expect(mocks.recreateContainerIfRunning).not.toHaveBeenCalled();
  });

  it('does NOT mount when the user picks the negative option', async () => {
    await writeValidPluginPkg();
    mocks.askConfirm.mockResolvedValue({
      bridged: true,
      confirmed: false,
      cancelled: false,
    });

    const result = await registry.invoke(['mount-plugin', pluginDir], makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/Cancelled/);
    expect(mocks.workspaceManager.addRoot).not.toHaveBeenCalled();
  });

  it('fails safely when no UI bridge is available and --yes is not set', async () => {
    await writeValidPluginPkg();
    mocks.askConfirm.mockResolvedValue({
      bridged: false,
      confirmed: false,
      cancelled: false,
    });

    const result = await registry.invoke(['mount-plugin', pluginDir], makeContext());

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/no UI bridge|--yes/i);
    expect(mocks.workspaceManager.addRoot).not.toHaveBeenCalled();
  });

  it('is idempotent when the plugin path is already attached', async () => {
    await writeValidPluginPkg();
    mocks.workspaceManager.getRoots.mockResolvedValue([
      {
        id: 'existing',
        name: 'existing',
        path: pluginDir,
        kind: 'linked-plugin',
      },
    ]);

    const result = await registry.invoke(['mount-plugin', pluginDir], makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/already attached/);
    expect(mocks.askConfirm).not.toHaveBeenCalled();
    expect(mocks.workspaceManager.addRoot).not.toHaveBeenCalled();
  });

  it('resolves a relative plugin path against the CLI cwd', async () => {
    await writeValidPluginPkg();
    mocks.askConfirm.mockResolvedValue({ bridged: true, confirmed: true, cancelled: false });
    mocks.workspaceManager.addRoot.mockResolvedValue({
      id: 'my-plugin',
      name: 'my-plugin',
      path: pluginDir,
      kind: 'linked-plugin',
    });

    await registry.invoke(
      ['mount-plugin', 'my-plugin'],
      makeContext({ cwd: tmpRoot }),
    );

    expect(mocks.workspaceManager.addRoot).toHaveBeenCalledWith('ws-1', {
      name: 'my-plugin',
      path: pluginDir,
      kind: 'linked-plugin',
    });
  });

  it('fails with a clear error when the workspace id is unknown', async () => {
    await writeValidPluginPkg();
    mocks.workspaceManager.getPath.mockReturnValue(undefined);

    const result = await registry.invoke(['mount-plugin', pluginDir], makeContext());

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/Workspace not found/);
    expect(mocks.askConfirm).not.toHaveBeenCalled();
  });
});
