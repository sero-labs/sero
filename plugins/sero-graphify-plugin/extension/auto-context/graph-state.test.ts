import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectGraphArtifacts } from './graph-state';
import { graphifyPathsFromHome } from '../../shared/paths';
import { readStateFile, writeStateFile } from '../../shared/state-io';
import { CURRENT_INDEX_MODE_VERSION, DEFAULT_STATE, type GraphifyState } from '../../shared/types';

const FIXTURE = path.join(__dirname, '..', '..', 'shared', 'query-engine', 'fixtures', 'small-graph.json');

async function makeHome(options: { workspaceGraph?: boolean; report?: boolean; profileGraph?: boolean; cwd: string }) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'graphify-home-'));
  const paths = graphifyPathsFromHome(home);
  const state: GraphifyState = {
    ...structuredClone(DEFAULT_STATE),
    workspaces: {
      ws1: {
        workspaceId: 'ws1', name: 'One', path: options.cwd, enabled: true,
        status: 'idle', indexModeVersion: CURRENT_INDEX_MODE_VERSION,
      },
    },
  };
  await writeStateFile(paths.stateFile, state);
  if (options.workspaceGraph) {
    const outDir = path.join(paths.graphsDir, 'ws1', 'graphify-out');
    await mkdir(outDir, { recursive: true });
    await copyFile(FIXTURE, path.join(outDir, 'graph.json'));
    if (options.report) {
      await writeFile(path.join(outDir, 'GRAPH_REPORT.md'), '# Communities\nAuth cluster.\n');
    }
  }
  if (options.profileGraph) {
    await mkdir(paths.profileDir, { recursive: true });
    await copyFile(FIXTURE, paths.profileGraph);
  }
  return paths;
}

describe('detectGraphArtifacts', () => {
  it('resolves the current workspace graph and report', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    const paths = await makeHome({ workspaceGraph: true, report: true, cwd });
    const info = await detectGraphArtifacts(paths, cwd);
    expect(info.graphExists).toBe(true);
    expect(info.reportExists).toBe(true);
    expect(info.graphPath).toContain(path.join('graphs', 'ws1'));
  });

  it('stays absent for unindexed workspaces even when a profile graph exists', async () => {
    // Regression: the profile-graph fallback made auto-context fire in EVERY
    // workspace once any one workspace was indexed.
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    const paths = await makeHome({ profileGraph: true, cwd });
    const info = await detectGraphArtifacts(paths, cwd);
    expect(info.graphExists).toBe(false);
  });

  it('stays absent while the workspace needs a clean rebuild', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    const paths = await makeHome({ workspaceGraph: true, report: true, cwd });
    const current = await readStateFile(paths.stateFile);
    await writeStateFile(paths.stateFile, {
      ...current!,
      workspaces: {
        ...current!.workspaces,
        ws1: { ...current!.workspaces.ws1, indexModeVersion: undefined },
      },
    });

    const info = await detectGraphArtifacts(paths, cwd);
    expect(info.graphExists).toBe(false);
    expect(info.reportExists).toBe(false);
  });

  it('stays absent for cwds that resolve to no workspace at all', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-elsewhere-'));
    const paths = await makeHome({ workspaceGraph: true, profileGraph: true, cwd: '/some/other/place' });
    const info = await detectGraphArtifacts(paths, cwd);
    expect(info.graphExists).toBe(false);
  });

  it('reports absent when nothing is built', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    const paths = await makeHome({ cwd });
    const info = await detectGraphArtifacts(paths, cwd);
    expect(info.graphExists).toBe(false);
  });
});
