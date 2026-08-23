import { existsSync, statSync } from 'node:fs';
import type { GraphifyPaths } from '../../shared/paths';
import { workspaceGraphJson, workspaceGraphReport } from '../../shared/paths';
import { readStateFile } from '../../shared/state-io';
import { CURRENT_INDEX_MODE_VERSION } from '../../shared/types';
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
 * Detect graph/report paths for the session — STRICTLY the current
 * workspace's own graph. No profile-graph fallback here: auto-context must
 * stay completely silent in workspaces that are not indexed themselves
 * (the graphify_query/search tools handle profile-wide fallback explicitly).
 * Cheap: existence + stat only, no content reads.
 */
export async function detectGraphArtifacts(paths: GraphifyPaths, cwd: string): Promise<GraphArtifactInfo> {
  const state = await readStateFile(paths.stateFile);
  const entry = state ? resolveCurrentWorkspace(state, cwd) : null;
  if (!entry || entry.indexModeVersion !== CURRENT_INDEX_MODE_VERSION) {
    return { graphPath: '', reportPath: '', graphExists: false, reportExists: false, graphSize: 0, reportSize: 0 };
  }

  const graphPath = workspaceGraphJson(paths, entry.workspaceId);
  const reportPath = workspaceGraphReport(paths, entry.workspaceId);
  const graphExists = existsSync(graphPath);
  const reportExists = existsSync(reportPath);

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
