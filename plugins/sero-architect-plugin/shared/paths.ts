import os from 'node:os';
import path from 'node:path';

/**
 * Root of the active profile's Sero home. The runtime gets the same directory
 * from `host.appState.globalDir('architect')`; this resolver serves the Pi
 * extension, which has only the environment.
 */
export function resolveSeroHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SERO_HOME) return env.SERO_HOME;
  if (env.PI_CODING_AGENT_DIR) return path.dirname(env.PI_CODING_AGENT_DIR);
  return path.join(os.homedir(), '.pi');
}

/**
 * Everything Architect persists lives under `<SERO_HOME>/apps/architect/`.
 * The index IS the app's state file: the host watches it, pushes changes to
 * the UI, and the runtime writes it through `host.appState.update`, which is
 * the locked, atomic, etag-checked path. Full records sit beside it in
 * `projects/<id>.json`, written by the runtime alone.
 */
export interface ArchitectPaths {
  home: string;
  indexFile: string;
  projectsDir: string;
}

export function architectPathsFromHome(home: string): ArchitectPaths {
  return {
    home,
    indexFile: path.join(home, 'state.json'),
    projectsDir: path.join(home, 'projects'),
  };
}

export function resolveArchitectPaths(env: NodeJS.ProcessEnv = process.env): ArchitectPaths {
  return architectPathsFromHome(path.join(resolveSeroHome(env), 'apps', 'architect'));
}

export function projectRecordPath(paths: ArchitectPaths, projectId: string): string {
  return path.join(paths.projectsDir, `${projectId}.json`);
}
