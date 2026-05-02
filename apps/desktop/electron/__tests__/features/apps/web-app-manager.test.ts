import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';

const mocks = vi.hoisted(() => ({
  workspaceManager: {
    getPath: vi.fn(),
  },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: mocks.workspaceManager,
}));

describe('webWorkspaceActionManager', () => {
  let tmpDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-web-app-manager-'));
    workspacePath = path.join(tmpDir, 'workspace');
    await fs.mkdir(path.join(workspacePath, '.sero', 'apps', 'web'), { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, '.sero-workspace.json'),
      JSON.stringify({ id: 'workspace', name: 'Workspace' }),
      'utf8',
    );
    mocks.workspaceManager.getPath.mockReturnValue(workspacePath);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('routes clear-history through the shared web state owner', async () => {
    const statePath = path.join(workspacePath, '.sero', 'apps', 'web', 'state.json');
    await fs.writeFile(
      statePath,
      JSON.stringify({
        entries: [{ id: 'entry-1', type: 'search', timestamp: Date.now(), queries: [] }],
        bookmarks: [],
        downloads: [],
        providers: { exa: false, perplexity: false, gemini: false },
        activeProvider: 'auto',
        workflow: 'summary-review',
        historyClearedAt: 0,
        lastSyncedAt: 0,
      }),
      'utf8',
    );

    const { webWorkspaceActionManager } = await import('@electron/features/apps/web-app/manager');
    const result = await webWorkspaceActionManager.runWorkspaceAction('workspace-1', {
      action: 'clear-history',
    });

    expect(result).toEqual({ ok: true, action: 'clear-history' });
    const next = JSON.parse(await fs.readFile(statePath, 'utf8')) as {
      entries: unknown[];
      historyClearedAt: number;
    };
    expect(next.entries).toEqual([]);
    expect(next.historyClearedAt).toBeGreaterThan(0);
  });

  it('deletes completed download files before removing the persisted entry', async () => {
    const statePath = path.join(workspacePath, '.sero', 'apps', 'web', 'state.json');
    const downloadPath = path.join(workspacePath, 'Downloads', 'report.pdf');
    await fs.mkdir(path.dirname(downloadPath), { recursive: true });
    await fs.writeFile(downloadPath, 'pdf', 'utf8');
    await fs.writeFile(
      statePath,
      JSON.stringify({
        entries: [],
        bookmarks: [],
        downloads: [{
          id: 'download-1',
          sourceUrl: 'https://example.com/report.pdf',
          title: 'report.pdf',
          status: 'completed',
          phase: 'Saved',
          progressPct: 100,
          relativePath: 'Downloads/report.pdf',
          absolutePath: downloadPath,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
        providers: { exa: false, perplexity: false, gemini: false },
        activeProvider: 'auto',
        workflow: 'summary-review',
        historyClearedAt: 0,
        lastSyncedAt: 0,
      }),
      'utf8',
    );

    const { webWorkspaceActionManager } = await import('@electron/features/apps/web-app/manager');
    const result = await webWorkspaceActionManager.runWorkspaceAction('workspace-1', {
      action: 'delete-download',
      downloadId: 'download-1',
      relativePath: 'Downloads/report.pdf',
      completed: true,
    });

    expect(result).toEqual({ ok: true, action: 'delete-download' });
    await expect(fs.stat(downloadPath)).rejects.toThrow();
    const next = JSON.parse(await fs.readFile(statePath, 'utf8')) as { downloads: unknown[] };
    expect(next.downloads).toEqual([]);
  });

  it('rejects download paths that escape the workspace root', async () => {
    const { webWorkspaceActionManager } = await import('@electron/features/apps/web-app/manager');
    const result = await webWorkspaceActionManager.runWorkspaceAction('workspace-1', {
      action: 'delete-download',
      downloadId: 'download-1',
      relativePath: '../outside.txt',
      completed: true,
    });

    expect(result).toEqual({
      ok: false,
      action: 'delete-download',
      message: 'Path escapes workspace: ../outside.txt',
    });
  });
});
