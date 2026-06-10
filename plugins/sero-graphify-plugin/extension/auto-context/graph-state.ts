import { existsSync, statSync } from 'node:fs';
import type { GraphifyPaths } from '../../shared/paths';
import { workspaceGraphJson, workspaceGraphReport } from '../../shared/paths';
import { readStateFile } from '../../shared/state-io';
import { resolveCurrentWorkspace } from '../current-workspace';
import type { GraphContextState } from './state';

export interface GraphArtifactInfo {
  graphPath: string;
  reportPath: string;
  graphExists: boolean;
  reportExists: boolean;
  graphSize: number;
  reportSize: number;
}

/**
 * Detect graph/report paths for the session. Prefers the current workspace's
 * graph (resolved from plugin state + cwd), falling back to the profile graph.
 * Cheap: existence + stat only, no content reads.
 */
export async function detectGraphArtifacts(paths: GraphifyPaths, cwd: string): Promise<GraphArtifactInfo> {
  const state = await readStateFile(paths.stateFile);
  const entry = state ? resolveCurrentWorkspace(state, cwd) : null;

  let graphPath = entry ? workspaceGraphJson(paths, entry.workspaceId) : paths.profileGraph;
  let reportPath = entry ? workspaceGraphReport(paths, entry.workspaceId) : '';
  if (entry && !existsSync(graphPath) && existsSync(paths.profileGraph)) {
    graphPath = paths.profileGraph;
    reportPath = '';
  }

  const graphExists = existsSync(graphPath);
  const reportExists = Boolean(reportPath) && existsSync(reportPath);

  let graphSize = 0;
  let reportSize = 0;
  if (graphExists) {
    try {
      graphSize = statSync(graphPath).size;
    } catch {
      /* ignore stat errors */
    }
  }
  if (reportExists) {
    try {
      reportSize = statSync(reportPath).size;
    } catch {
      /* ignore stat errors */
    }
  }

  return { graphPath, reportPath, graphExists, reportExists, graphSize, reportSize };
}

/** Sync per-session graph state (paths + existence) from the filesystem. */
export async function syncGraphContextProjectState(
  state: GraphContextState,
  paths: GraphifyPaths,
  cwd: string,
): Promise<void> {
  const info = await detectGraphArtifacts(paths, cwd);
  state.graphPath = info.graphPath;
  state.reportPath = info.reportPath;
  state.graphExists = info.graphExists;
}

/** Reset all per-session state (caches, counters). Re-syncs project paths. */
export async function resetGraphContextSessionState(
  state: GraphContextState,
  paths: GraphifyPaths,
  cwd: string,
): Promise<void> {
  await syncGraphContextProjectState(state, paths, cwd);
  state.reportContextInjected = false;
  state.augmentHits = 0;
  state.hookFires = 0;
  state.augmentedCache.clear();
  state.emptyCache.clear();
}
