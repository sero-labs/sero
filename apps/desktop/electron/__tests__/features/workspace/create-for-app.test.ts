/**
 * Workspace creation for plugin callers (spec plugin-workspace-create).
 *
 * The real WorkspaceManager does the creating so the home-directory guard is
 * the production one; everything around it (reconcile, discovery, tool
 * invocation, the changed push) is injected and observed.
 */

import { mkdir, mkdtemp, readdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';
import { WorkspaceManager } from '@electron/features/workspace/manager';
import {
  assertWorkspaceCreateDeclared,
  createWorkspaceForApp,
  WORKSPACE_CREATE_CAPABILITY,
  type CreateWorkspaceForAppDeps,
} from '@electron/features/workspace/create-for-app';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTestManager(): Promise<{ manager: WorkspaceManager; workspacesDir: string; root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-create-for-app-'));
  tempDirs.push(root);
  const agentDir = path.join(root, 'agent');
  const workspacesDir = path.join(root, 'workspaces');
  await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(workspacesDir, { recursive: true })]);
  const manager = new WorkspaceManager({
    agentDir,
    workspacesDir,
    registryPath: path.join(agentDir, 'workspaces.json'),
    editorStateDir: path.join(agentDir, 'editor-state'),
  });
  return { manager, workspacesDir, root };
}

function manifest(id: string, controls: SeroAppManifest['contributions']['controls']): SeroAppManifest {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: null,
    runtimeEntry: null,
    component: null,
    devPort: undefined,
    remoteEntryOverride: null,
    packagePath: `/tmp/${id}`,
    isPlugin: true,
    plugin: { category: 'utilities', tags: [] },
    hostCompatibility: { supported: true, hostVersion: '0.1.0', issues: [] },
    contributions: { components: [], controls },
    contributionDiagnostics: [],
  };
}

function option(id: string, defaultValue: boolean, tool: string, params?: Record<string, unknown>) {
  return {
    id,
    extensionPoint: 'workspace.create.option' as const,
    control: { type: 'switch' as const, label: id, defaultValue },
    action: { type: 'tool' as const, tool, params },
  };
}

function deps(manager: WorkspaceManager, apps: SeroAppManifest[]) {
  const reconcileAppRuntimes = vi.fn<CreateWorkspaceForAppDeps['reconcileAppRuntimes']>(async () => {});
  const invokeAppTool = vi.fn<CreateWorkspaceForAppDeps['invokeAppTool']>(
    async () => ({ text: 'ok', content: [], details: null, isError: false }),
  );
  const notifyWorkspaceChanged = vi.fn<CreateWorkspaceForAppDeps['notifyWorkspaceChanged']>(() => {});
  const d: CreateWorkspaceForAppDeps = {
    create: (name, parentPath, options) => manager.create(name, parentPath, options),
    reconcileAppRuntimes,
    discoverApps: async () => apps,
    invokeAppTool,
    notifyWorkspaceChanged,
  };
  return { ...d, reconcileAppRuntimes, invokeAppTool, notifyWorkspaceChanged };
}

describe('assertWorkspaceCreateDeclared', () => {
  it('refuses a plugin that did not declare the capability, naming it', () => {
    expect(() => assertWorkspaceCreateDeclared({
      id: 'quiet',
      plugin: { category: 'utilities', tags: [], requiredHostCapabilities: ['appRuntime.background'] },
    })).toThrow(`"quiet" cannot create workspaces: add "${WORKSPACE_CREATE_CAPABILITY}"`);
    expect(() => assertWorkspaceCreateDeclared({ id: 'bare', plugin: undefined })).toThrow(WORKSPACE_CREATE_CAPABILITY);
  });

  it('accepts a plugin that declared it', () => {
    expect(() => assertWorkspaceCreateDeclared({
      id: 'architect',
      plugin: { category: 'utilities', tags: [], requiredHostCapabilities: [WORKSPACE_CREATE_CAPABILITY] },
    })).not.toThrow();
  });
});

describe('createWorkspaceForApp', () => {
  it('applies the home-directory guard and creates nothing outside it', async () => {
    const { manager, root } = await createTestManager();
    const d = deps(manager, []);
    const outside = path.join(root, 'elsewhere');
    // The temp root sits outside the home directory on every supported platform.
    expect(outside.startsWith(os.homedir() + path.sep)).toBe(false);

    await expect(createWorkspaceForApp(d, { name: 'Escape', parentPath: outside }))
      .rejects.toThrow('Workspace parent path must be under the user home directory');

    expect(await readdir(root)).not.toContain('elsewhere');
    expect(d.notifyWorkspaceChanged).not.toHaveBeenCalled();
    expect(d.reconcileAppRuntimes).not.toHaveBeenCalled();
  });

  it('runs the default-on creation options with host context and pushes workspace-changed', async () => {
    const { manager, workspacesDir } = await createTestManager();
    const apps = [
      manifest('graphify', [option('workspace-indexing', true, 'graphify_enable', { mode: 'full' })]),
      manifest('quiet', [option('off-by-default', false, 'quiet_setup')]),
    ];
    const d = deps(manager, apps);

    const workspace = await createWorkspaceForApp(d, { name: 'Hollow Depths', options: { applyAppDefaults: true } });

    expect(workspace.path).toBe(path.join(workspacesDir, 'hollow-depths'));
    expect(d.invokeAppTool).toHaveBeenCalledTimes(1);
    expect(d.invokeAppTool).toHaveBeenCalledWith('graphify', workspace.id, 'graphify_enable', {
      mode: 'full',
      workspaceId: workspace.id,
      workspaceName: 'Hollow Depths',
      workspacePath: workspace.path,
    });
    expect(d.reconcileAppRuntimes).toHaveBeenCalledWith('workspace create');
    expect(d.notifyWorkspaceChanged).toHaveBeenCalledTimes(1);
    // Ordering: the push is the last thing, after the options have run.
    expect(d.notifyWorkspaceChanged.mock.invocationCallOrder[0])
      .toBeGreaterThan(d.invokeAppTool.mock.invocationCallOrder[0]);
  });

  it('leaves the options to the caller when applyAppDefaults is not set', async () => {
    const { manager } = await createTestManager();
    const d = deps(manager, [manifest('graphify', [option('workspace-indexing', true, 'graphify_enable')])]);

    await createWorkspaceForApp(d, { name: 'Menu Path' });

    expect(d.invokeAppTool).not.toHaveBeenCalled();
    expect(d.notifyWorkspaceChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps a failing option from failing the creation', async () => {
    const { manager } = await createTestManager();
    const d = deps(manager, [manifest('graphify', [option('workspace-indexing', true, 'graphify_enable')])]);
    d.invokeAppTool.mockRejectedValueOnce(new Error('index service down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const workspace = await createWorkspaceForApp(d, { name: 'Resilient', options: { applyAppDefaults: true } });

    expect(workspace.id).toBe('resilient');
    expect(warn).toHaveBeenCalledWith('[workspace] workspace-indexing:', expect.any(Error));
    expect(d.notifyWorkspaceChanged).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
