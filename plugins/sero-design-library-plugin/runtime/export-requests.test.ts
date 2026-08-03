import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRuntimeWorkspaceApi } from '@sero-ai/common';

import { designLibraryPathsFromHome, exportFile, type DesignLibraryPaths } from '../shared/paths';
import { readStateWithIndexes } from '../shared/state-io';
import { runGalleryExport } from './export';
import { ExportRequests } from './export-requests';

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
});
