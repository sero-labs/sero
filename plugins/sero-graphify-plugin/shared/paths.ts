import os from 'node:os';
import path from 'node:path';

/**
 * Root of the active profile's Sero home. Host path; the same path is
 * mounted into container sessions (read-only is sufficient for queries).
 */
export function resolveSeroHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SERO_HOME) return env.SERO_HOME;
  if (env.PI_CODING_AGENT_DIR) return path.dirname(env.PI_CODING_AGENT_DIR);
  return path.join(os.homedir(), '.pi');
}

/**
 * Per-profile graph artifact paths. Tool installs (uv/Python/graphifyy) are
 * deliberately NOT here — they are machine-shared via
 * `host.toolchains.sharedToolsDir('graphify')`, never per-profile.
 */
export interface GraphifyPaths {
  home: string;
  stateFile: string;
  graphsDir: string;
  profileDir: string;
  profileGraph: string;
}

export function graphifyPathsFromHome(home: string): GraphifyPaths {
  return {
    home,
    stateFile: path.join(home, 'state.json'),
    graphsDir: path.join(home, 'graphs'),
    profileDir: path.join(home, 'profile'),
    profileGraph: path.join(home, 'profile', 'graph.json'),
  };
}

export function resolveGraphifyPaths(env: NodeJS.ProcessEnv = process.env): GraphifyPaths {
  return graphifyPathsFromHome(path.join(resolveSeroHome(env), 'apps', 'graphify'));
}

export function workspaceGraphDir(paths: GraphifyPaths, workspaceId: string): string {
  return path.join(paths.graphsDir, workspaceId);
}

export function workspaceGraphJson(paths: GraphifyPaths, workspaceId: string): string {
  return path.join(workspaceGraphDir(paths, workspaceId), 'graphify-out', 'graph.json');
}

export function workspaceGraphReport(paths: GraphifyPaths, workspaceId: string): string {
  return path.join(workspaceGraphDir(paths, workspaceId), 'graphify-out', 'GRAPH_REPORT.md');
}
