import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';
import { runtimeSkipReason, type RuntimeBackend } from './helpers/runtime';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let parentDir: string;

const editorBackends: RuntimeBackend[] = ['apple-container', 'docker'];
const seroNodeImage = `ghcr.io/sero-labs/sero-node:${process.env.SERO_NODE_IMAGE_TAG?.trim() || 'latest'}`;
const expectedVcsMethods = [
  'listCheckpoints',
  'getState',
  'createCheckpoint',
  'restore',
  'diff',
  'watch',
  'unwatch',
  'onEvent',
  'logEntries',
  'status',
  'fileDiffSummary',
  'fileContent',
  'describe',
  'bookmarks',
  'createBookmark',
  'deleteBookmark',
  'moveBookmark',
  'remotes',
  'addRemote',
  'setRemoteUrl',
  'removeRemote',
  'checkoutRemote',
  'fetch',
  'push',
  'pushDryRun',
  'prState',
  'prPreview',
  'prGenerateDraft',
  'prCreate',
  'undo',
  'abandon',
  'squash',
  'opLog',
];

async function removeWorkspaceIfPresent(workspaceId: string): Promise<void> {
  const exists = await page.evaluate(
    (id) => window.sero.workspace.list().then((workspaces) => workspaces.some((workspace) => workspace.id === id)),
    workspaceId,
  );
  if (!exists) return;
  await page.evaluate((id) => window.sero.workspace.remove(id), workspaceId);
}

function canRun(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function skipBackendReason(backend: RuntimeBackend): string | null {
  const platformSkip = runtimeSkipReason(backend);
  if (platformSkip) return platformSkip;
  if (process.env.CI) {
    return `Runtime "${backend}" editor behavior is skipped in CI to avoid daemon startup or image pulls.`;
  }
  if (backend === 'apple-container') {
    if (!canRun('container', ['system', 'status'])) return 'Apple Container is not running.';
    if (!canRun('container', ['image', 'inspect', seroNodeImage])) {
      return `Apple Container image ${seroNodeImage} is not available locally.`;
    }
  }
  if (backend === 'docker') {
    if (!canRun('docker', ['info'])) return 'Docker is not running.';
    if (!canRun('docker', ['image', 'inspect', seroNodeImage])) {
      return `Docker image ${seroNodeImage} is not available locally.`;
    }
  }
  return null;
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  parentDir = path.join(home.path, 'editor-vcs-workspaces');
  fs.mkdirSync(parentDir, { recursive: true });

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

test.describe('editor IPC contracts', () => {
  test('writes, reads, and lists files in a host workspace', async () => {
    const content = `hello contract ${Date.now()}`;
    const result = await page.evaluate(async ({ parent, body }) => {
      const workspace = await window.sero.workspace.create('Editor Host Contract', parent);
      try {
        await window.sero.editor.writeFile(workspace.id, 'notes/contract.txt', body);
        const readContent = await window.sero.editor.readFile(workspace.id, 'notes/contract.txt');
        const files = await window.sero.editor.listFiles(workspace.id, 'notes');
        const rootPath = await window.sero.editor.getRootPath(workspace.id);
        const isContainer = await window.sero.editor.isContainer(workspace.id);
        return { workspace, readContent, files, rootPath, isContainer };
      } finally {
        await window.sero.workspace.remove(workspace.id);
      }
    }, { parent: parentDir, body: content });

    expect(result.workspace).toEqual(expect.objectContaining({
      id: expect.any(String),
      path: expect.stringContaining(parentDir),
      runtime: expect.objectContaining({ backend: 'host' }),
    }));
    expect(result.readContent).toBe(content);
    expect(result.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'contract.txt', type: 'file', size: content.length }),
    ]));
    expect(result.rootPath).toBe('/workspace');
    expect(result.isContainer).toBe(false);
    expect(fs.existsSync(path.join(result.workspace.path, 'notes', 'contract.txt'))).toBe(true);
  });

  for (const backend of editorBackends) {
    test(`writes, reads, and lists files in a ${backend} workspace when explicitly available`, async () => {
      const skipReason = skipBackendReason(backend);
      test.skip(skipReason !== null, skipReason ?? undefined);

      const content = `hello ${backend} contract ${Date.now()}`;
      const result = await page.evaluate(async ({ parent, runtime, body }) => {
        const workspace = await window.sero.workspace.create(`Editor ${runtime} Contract`, parent);
        try {
          const configured = await window.sero.workspace.setRuntimeBackend(workspace.id, runtime);
          await window.sero.editor.writeFile(workspace.id, 'notes/contract.txt', body);
          const readContent = await window.sero.editor.readFile(workspace.id, 'notes/contract.txt');
          const files = await window.sero.editor.listFiles(workspace.id, 'notes');
          const isContainer = await window.sero.editor.isContainer(workspace.id);
          return { configured, readContent, files, isContainer };
        } finally {
          await window.sero.workspace.remove(workspace.id);
        }
      }, { parent: parentDir, runtime: backend, body: content });

      expect(result.configured.runtime.backend).toBe(backend);
      expect(result.readContent).toBe(content);
      expect(result.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'contract.txt', type: 'file' }),
      ]));
      expect(result.isContainer).toBe(true);
    });
  }
});

test.describe('VCS IPC contracts', () => {
  test('exposes old checkpoint and rich VCS bridge methods', async () => {
    const surface = await page.evaluate((methodNames) => {
      const vcs = window.sero.vcs as unknown as Record<string, unknown>;
      return Object.fromEntries(methodNames.map((name) => [name, typeof vcs[name]]));
    }, expectedVcsMethods);

    for (const method of expectedVcsMethods) {
      expect(surface[method]).toBe('function');
    }
  });

  test('returns stable cheap state, status, log, bookmark, and remote shapes', async () => {
    const result = await page.evaluate(async ({ parent }) => {
      const workspace = await window.sero.workspace.create('VCS Contract', parent);
      try {
        await window.sero.editor.writeFile(workspace.id, 'notes/vcs.txt', 'vcs contract');
        const checkpoints = await window.sero.vcs.listCheckpoints(workspace.id, 10);
        const state = await window.sero.vcs.getState(workspace.id, 10);
        const status = await window.sero.vcs.status(workspace.id);
        const logEntries = await window.sero.vcs.logEntries(workspace.id, 10);
        const bookmarks = await window.sero.vcs.branches(workspace.id);
        const remotes = await window.sero.vcs.remotes(workspace.id);
        return { workspaceId: workspace.id, state, checkpoints, status, logEntries, bookmarks, remotes };
      } finally {
        await window.sero.workspace.remove(workspace.id);
      }
    }, { parent: parentDir });

    expect(result.state).toEqual(expect.objectContaining({
      workspaceId: result.workspaceId,
      currentChangeId: null,
      hasWorkingCopyChanges: true,
      checkpoints: expect.any(Array),
    }));
    expect(result.checkpoints).toEqual([]);
    expect(result.status).toEqual(expect.objectContaining({
      files: expect.any(Array),
      conflictCount: expect.any(Number),
      parentChangeIds: expect.any(Array),
    }));
    expect(result.status.files.length).toBeGreaterThan(0);
    expect(result.status.files[0]).toEqual(expect.objectContaining({
      path: expect.any(String),
      status: expect.any(String),
    }));
    expect(result.logEntries).toEqual([]);
    expect(result.bookmarks).toEqual([]);
    expect(result.remotes).toEqual([]);
  });
});
