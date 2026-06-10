import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectGraphArtifacts } from './graph-state';
import { graphifyPathsFromHome } from '../../shared/paths';
import { writeStateFile } from '../../shared/state-io';
import { DEFAULT_STATE, type GraphifyState } from '../../shared/types';

const FIXTURE = path.join(__dirname, '..', '..', 'shared', 'query-engine', 'fixtures', 'small-graph.json');

async function makeHome(options: { workspaceGraph?: boolean; report?: boolean; profileGraph?: boolean; cwd: string }) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'graphify-home-'));
  const paths = graphifyPathsFromHome(home);
  const state: GraphifyState = {
    ...structuredClone(DEFAULT_STATE),
    workspaces: {
      ws1: { workspaceId: 'ws1', name: 'One', path: options.cwd, enabled: true, status: 'idle' },
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

  it('falls back to the profile graph when the workspace is not indexed', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    const paths = await makeHome({ profileGraph: true, cwd });
    const info = await detectGraphArtifacts(paths, cwd);
    expect(info.graphExists).toBe(true);
    expect(info.graphPath).toBe(paths.profileGraph);
  });

  it('reports absent when nothing is built', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    const paths = await makeHome({ cwd });
    const info = await detectGraphArtifacts(paths, cwd);
    expect(info.graphExists).toBe(false);
  });
});
