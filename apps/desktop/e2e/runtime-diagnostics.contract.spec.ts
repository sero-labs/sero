import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';
import type { WorkspaceRuntimeBackend } from '../src/types/workspace-runtime';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

const runtimeBackends: WorkspaceRuntimeBackend[] = ['host', 'apple-container', 'docker'];
const runtimeKinds = ['host', 'container'];
const coreToolNames = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash'] as const;
const capabilityKeys = [
  'browserAutomation',
  'containerizedLanguageServers',
  'managedDevServers',
  'containerMounts',
];
const toolchainStates = ['ready', 'installing', 'missing', 'failed'];
const managedToolStates = ['ready', 'missing', 'installing', 'incompatible', 'failed'];
const browserPackStates = ['ready', 'missing', 'installable', 'installing', 'failed'];

function expectNonEmptyString(value: unknown): void {
  expect(typeof value).toBe('string');
  if (typeof value === 'string') expect(value.trim()).not.toBe('');
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: { HOME: home.path, USERPROFILE: home.path, SERO_HOST_FIRST: '1' },
  }));
});

test.afterAll(async () => {
  try {
    await closeSeroApp(app);
  } finally {
    home.cleanup();
  }
});

async function removeWorkspaceIfPresent(workspaceId: string): Promise<void> {
  const exists = await page.evaluate(
    (id) => window.sero.workspace.list().then((workspaces) => workspaces.some((workspace) => workspace.id === id)),
    workspaceId,
  );
  if (!exists) return;
  await page.evaluate((id) => window.sero.workspace.remove(id), workspaceId);
}

function expectRuntimeDiagnosticsShape(item: unknown, workspaceId?: string): void {
  expect(item).toEqual(expect.objectContaining({
    workspaceId: workspaceId ?? expect.any(String),
    workspacePath: expect.any(String),
    desiredRuntime: expect.any(String),
    actualRuntime: expect.any(String),
    containerEnabled: expect.any(Boolean),
    capabilityState: expect.objectContaining({
      support: expect.any(Object),
      available: expect.any(Object),
      installState: expect.any(Object),
    }),
    capabilityAudit: expect.any(Array),
  }));

  const diagnostic = item as {
    desiredRuntime: string;
    actualRuntime: string;
    desiredBackend?: string;
    actualBackend?: string;
    fallbackCode?: string;
    fallbackReason?: string;
    capabilityState: {
      installState: Record<string, string>;
    };
    capabilityAudit: Array<Record<string, unknown>>;
  };

  expect(runtimeKinds).toContain(diagnostic.desiredRuntime);
  expect(runtimeKinds).toContain(diagnostic.actualRuntime);
  if (diagnostic.desiredBackend) expect(runtimeBackends).toContain(diagnostic.desiredBackend as WorkspaceRuntimeBackend);
  if (diagnostic.actualBackend) expect(runtimeBackends).toContain(diagnostic.actualBackend as WorkspaceRuntimeBackend);
  if (diagnostic.fallbackCode) expect(typeof diagnostic.fallbackCode).toBe('string');
  if (diagnostic.fallbackReason) expect(typeof diagnostic.fallbackReason).toBe('string');

  expect(Object.keys(diagnostic.capabilityState.installState)).toEqual(expect.arrayContaining([
    'coreTools',
    'browserAutomation',
    'nativeBuildTools',
  ]));

  expect(diagnostic.capabilityAudit.map((entry) => entry.key)).toEqual(expect.arrayContaining(capabilityKeys));
  for (const entry of diagnostic.capabilityAudit) {
    expect(entry).toEqual(expect.objectContaining({
      key: expect.any(String),
      label: expect.any(String),
      support: expect.any(Boolean),
      available: expect.any(Boolean),
      containerOnly: expect.any(Boolean),
      detail: expect.any(String),
    }));
    expect(capabilityKeys).toContain(entry.key);
    if (!entry.support) expect(entry.available).toBe(false);
    if (entry.installState !== undefined) expect(typeof entry.installState).toBe('string');
  }
}

test.describe('runtime diagnostics IPC contracts', () => {
  test('returns capability and install-state diagnostics for host-launched workspaces', async () => {
    const setup = await page.evaluate(async (backends) => {
      const workspaces = [];
      for (const backend of backends) {
        const workspace = await window.sero.workspace.create(`Runtime Diagnostics ${backend}`);
        const updated = await window.sero.workspace.setRuntimeBackend(workspace.id, backend);
        const diagnostics = await window.sero.workspace.getRuntimeDiagnostics(workspace.id);
        workspaces.push({ workspace: updated, requestedBackend: backend, diagnostics });
      }
      const allDiagnostics = await window.sero.workspace.getRuntimeDiagnostics();
      return { workspaces, allDiagnostics };
    }, runtimeBackends);

    try {
      expect(setup.workspaces).toHaveLength(runtimeBackends.length);
      expect(setup.allDiagnostics.length).toBeGreaterThanOrEqual(runtimeBackends.length);

      const seenRuntimeKinds = new Set<string>();
      for (const entry of setup.workspaces) {
        expect(entry.workspace).toEqual(expect.objectContaining({
          id: expect.any(String),
          runtime: expect.objectContaining({ backend: expect.any(String) }),
        }));
        expect(runtimeBackends).toContain(entry.workspace.runtime.backend);
        expect(entry.diagnostics).toHaveLength(1);
        expectRuntimeDiagnosticsShape(entry.diagnostics[0], entry.workspace.id);
        const diagnostic = entry.diagnostics[0] as typeof entry.diagnostics[0] & {
          desiredBackend?: WorkspaceRuntimeBackend;
          actualBackend?: WorkspaceRuntimeBackend;
        };
        expect(diagnostic.desiredBackend).toBe(entry.requestedBackend);
        if (entry.requestedBackend === 'host') {
          expect(diagnostic).toEqual(expect.objectContaining({
            desiredRuntime: 'host',
            actualRuntime: 'host',
            desiredBackend: 'host',
            actualBackend: 'host',
            containerEnabled: false,
          }));
          expect(diagnostic.fallbackCode).toBeUndefined();
        } else {
          const platformSupportsAppleContainer = process.platform === 'darwin' && process.arch === 'arm64';
          const expectedBackend = entry.requestedBackend === 'apple-container' && !platformSupportsAppleContainer
            ? 'docker'
            : entry.requestedBackend;
          expect(diagnostic).toEqual(expect.objectContaining({
            desiredRuntime: 'container',
            actualRuntime: 'container',
            actualBackend: expectedBackend,
            containerEnabled: true,
          }));
          if (expectedBackend !== entry.requestedBackend) {
            expect(diagnostic).toEqual(expect.objectContaining({
              fallbackCode: 'backend-unsupported-on-platform',
            }));
            expectNonEmptyString(diagnostic.fallbackReason);
          }
          if (diagnostic.fallbackCode === 'container_unavailable') {
            expect(diagnostic.capabilityAudit.every((auditEntry) => auditEntry.available === false)).toBe(true);
          }
        }
        seenRuntimeKinds.add(diagnostic.desiredRuntime);
      }

      expect(seenRuntimeKinds.has('host')).toBe(true);
      expect(seenRuntimeKinds.has('container') || process.platform === 'win32').toBe(true);

      for (const diagnostic of setup.allDiagnostics) {
        expectRuntimeDiagnosticsShape(diagnostic);
      }
    } finally {
      for (const entry of setup.workspaces) {
        await removeWorkspaceIfPresent(entry.workspace.id);
      }
    }
  });

  test('returns stable managed core toolchain status without invoking installers', async () => {
    const status = await page.evaluate(() => window.sero.workspace.getToolchainStatus());

    expect(status).toEqual(expect.objectContaining({
      state: expect.any(String),
      tools: expect.any(Array),
    }));
    expect(toolchainStates).toContain(status.state);
    expect(status.tools).toHaveLength(coreToolNames.length);
    expect(status.tools.map((tool) => tool.tool).sort()).toEqual([...coreToolNames].sort());

    for (const tool of status.tools) {
      expect(tool).toEqual(expect.objectContaining({
        tool: expect.any(String),
        state: expect.any(String),
      }));
      expect(managedToolStates).toContain(tool.state);
      if (tool.source) expect(['system', 'managed']).toContain(tool.source);
      if (tool.path) expect(typeof tool.path).toBe('string');
      if (tool.version) expect(typeof tool.version).toBe('string');
    }

    if (status.progress) {
      expect(status.progress).toEqual(expect.objectContaining({
        tool: expect.any(String),
        phase: expect.any(String),
        artifactKey: expect.any(String),
        manifestVersion: expect.any(String),
      }));
    }
  });

  test('returns stable browser pack status without invoking installers', async () => {
    const status = await page.evaluate(() => window.sero.workspace.getBrowserPackStatus());

    expect(status).toEqual(expect.objectContaining({
      state: expect.any(String),
      manifestVersion: expect.any(String),
    }));
    expect(browserPackStates).toContain(status.state);
    expectNonEmptyString(status.manifestVersion);

    if (status.state === 'ready') {
      expectNonEmptyString(status.artifactKey);
      expectNonEmptyString(status.browsersPath);
    }
    if (status.state === 'installable' || status.state === 'missing' || status.state === 'installing') {
      expectNonEmptyString(status.artifactKey);
    }
    if (status.state === 'missing' || status.state === 'installable' || status.state === 'failed') {
      expect(status.error).toEqual(expect.objectContaining({ message: expect.any(String) }));
      expectNonEmptyString(status.error?.message);
    }

    if (status.progress) {
      expect(status.progress).toEqual(expect.objectContaining({
        phase: expect.any(String),
        manifestVersion: expect.any(String),
      }));
      expectNonEmptyString(status.progress.manifestVersion);
      if (status.progress.artifactKey !== undefined) expectNonEmptyString(status.progress.artifactKey);
    }
    if (status.state === 'installing') {
      expect(status.progress).toEqual(expect.objectContaining({
        phase: expect.any(String),
        manifestVersion: status.manifestVersion,
      }));
    }
  });
});
