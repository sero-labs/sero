import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRuntimeWorkspaceApi } from '@sero-ai/common';

import { designLibraryPathsFromHome, exportFile, type DesignLibraryPaths } from '../shared/paths';
import { readStateWithIndexes, writeJsonFile } from '../shared/state-io';
import { runGalleryExport } from './export';
import { ExportRequests, pruneExportHistory } from './export-requests';

vi.mock('./export', () => ({ runGalleryExport: vi.fn() }));

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-export-request-'));
  paths = designLibraryPathsFromHome(home);
  vi.mocked(runGalleryExport).mockReset();
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const REQUEST = {
  kind: 'export.run' as const,
  exportId: 'exp-1',
  familyId: 'fam-1',
  versionId: 'ver-1',
  destination: 'workspace' as const,
  workspacePath: '/workspace',
};

const workspaces = {
  list: async () => [{ id: 'ws', name: 'Workspace', path: '/workspace', open: true }],
} as AppRuntimeWorkspaceApi;

describe('export request state', () => {
  it('publishes the completed path', async () => {
    vi.mocked(runGalleryExport).mockResolvedValue('/workspace/signal');
    await new ExportRequests(paths, workspaces).apply(REQUEST);

    expect((await readStateWithIndexes(paths)).exports[0]).toMatchObject({
      id: 'exp-1', status: 'succeeded', path: '/workspace/signal',
    });
  });

  it('publishes a useful failure and lets the request finish', async () => {
    vi.mocked(runGalleryExport).mockRejectedValue(new Error('Snapshot is incomplete.'));
    await new ExportRequests(paths, workspaces).apply(REQUEST);

    expect((await readStateWithIndexes(paths)).exports[0]).toMatchObject({
      id: 'exp-1', status: 'failed', error: 'Snapshot is incomplete.',
    });
  });

  it('refuses a workspace path that the host did not register', async () => {
    await new ExportRequests(paths, workspaces).apply({
      ...REQUEST,
      workspacePath: '/tmp/not-a-workspace',
    });

    expect(runGalleryExport).not.toHaveBeenCalled();
    expect((await readStateWithIndexes(paths)).exports[0]).toMatchObject({
      status: 'failed', error: 'The requested export path is not inside an open workspace.',
    });
  });

  it('keeps only the 20 newest export records and index entries', async () => {
    vi.mocked(runGalleryExport).mockImplementation(async (_paths, request) =>
      `/workspace/${request.exportId}`);
    const exporter = new ExportRequests(paths, workspaces);
    for (let index = 0; index < 21; index += 1) {
      await exporter.apply({ ...REQUEST, exportId: `exp-${index}` });
    }

    const exports = (await readStateWithIndexes(paths)).exports;
    expect(exports).toHaveLength(20);
    expect(exports.map((entry) => entry.id)).not.toContain('exp-0');
    await expect(access(exportFile(paths, 'exp-0'))).rejects.toThrow();
  });

  it('does not turn a successful export into a failure when cleanup fails', async () => {
    vi.mocked(runGalleryExport).mockResolvedValue('/workspace/signal');
    const onError = vi.fn();
    const prune = vi.fn().mockRejectedValue(new Error('lock timed out'));

    await new ExportRequests(paths, workspaces, onError, prune).apply(REQUEST);

    expect(runGalleryExport).toHaveBeenCalledOnce();
    expect((await readStateWithIndexes(paths)).exports[0]).toMatchObject({
      status: 'succeeded', path: '/workspace/signal',
    });
    expect(onError).toHaveBeenCalledWith(
      'Could not prune Design Library export history',
      expect.objectContaining({ message: 'lock timed out' }),
    );
  });

  it('keeps running exports and removes every terminal export when the maximum is zero', async () => {
    const running = {
      id: 'exp-running', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
      status: 'running', createdAt: 1,
    } as const;
    const finished = {
      id: 'exp-finished', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
      status: 'succeeded', createdAt: 2, completedAt: 3, path: '/tmp/export',
    } as const;
    await Promise.all([
      writeJsonFile(exportFile(paths, running.id), running),
      writeJsonFile(exportFile(paths, finished.id), finished),
      writeJsonFile(paths.exportsIndexFile, [running, finished]),
    ]);

    await expect(pruneExportHistory(paths, 0)).resolves.toBe(1);
    expect((await readStateWithIndexes(paths)).exports).toEqual([running]);
    await expect(access(exportFile(paths, running.id))).resolves.toBeUndefined();
    await expect(access(exportFile(paths, finished.id))).rejects.toThrow();
  });

  it('rechecks a terminal candidate under its lock before deletion', async () => {
    const running = {
      id: 'exp-raced', familyId: 'fam-1', versionId: 'ver-1', destination: 'downloads',
      status: 'running', createdAt: 1,
    } as const;
    await writeJsonFile(exportFile(paths, running.id), running);
    await writeJsonFile(paths.exportsIndexFile, [{
      ...running, status: 'succeeded', completedAt: 2, path: '/tmp/export',
    }]);

    await expect(pruneExportHistory(paths, 0)).resolves.toBe(0);
    await expect(access(exportFile(paths, running.id))).resolves.toBeUndefined();
  });
});
