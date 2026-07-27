import os from 'node:os';
import path from 'node:path';

/**
 * Root of the active profile's Sero home. Falls back to `~/.pi` only when the
 * env vars are unset, which happens in plain Pi CLI mode.
 */
export function resolveSeroHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SERO_HOME) return env.SERO_HOME;
  if (env.PI_CODING_AGENT_DIR) return path.dirname(env.PI_CODING_AGENT_DIR);
  return path.join(os.homedir(), '.pi');
}

export interface DesignLibraryPaths {
  /** `$SERO_HOME/apps/design-library` */
  home: string;
  stateFile: string;
  lockDir: string;
  itemsDir: string;
  jobsDir: string;
  uploadsDir: string;
  tombstonesDir: string;
}

export function designLibraryPathsFromHome(home: string): DesignLibraryPaths {
  return {
    home,
    stateFile: path.join(home, 'state.json'),
    lockDir: path.join(home, '.state.lock'),
    itemsDir: path.join(home, 'items'),
    jobsDir: path.join(home, 'jobs'),
    uploadsDir: path.join(home, 'uploads'),
    tombstonesDir: path.join(home, 'tombstones'),
  };
}

/**
 * Identity kept after an item is permanently deleted, so a Design or Gallery
 * version that referenced it can still explain what is missing.
 */
export function tombstoneFile(paths: DesignLibraryPaths, itemId: string): string {
  return path.join(paths.tombstonesDir, `${itemId}.json`);
}

export function resolveDesignLibraryPaths(env: NodeJS.ProcessEnv = process.env): DesignLibraryPaths {
  return designLibraryPathsFromHome(path.join(resolveSeroHome(env), 'apps', 'design-library'));
}

export function itemDir(paths: DesignLibraryPaths, itemId: string): string {
  return path.join(paths.itemsDir, itemId);
}

export function itemRecordFile(paths: DesignLibraryPaths, itemId: string): string {
  return path.join(itemDir(paths, itemId), 'record.json');
}

export function jobFile(paths: DesignLibraryPaths, jobId: string): string {
  return path.join(paths.jobsDir, `${jobId}.json`);
}

export function uploadDir(paths: DesignLibraryPaths, uploadId: string): string {
  return path.join(paths.uploadsDir, uploadId);
}

export function uploadManifestFile(paths: DesignLibraryPaths, uploadId: string): string {
  return path.join(uploadDir(paths, uploadId), 'manifest.json');
}

/**
 * Resolve a path the UI asked for, relative to the app state directory, and
 * refuse anything that escapes it. The UI never touches plugin files directly,
 * so every path it names arrives as a string over a tool call and has to be
 * treated as untrusted input.
 */
export function resolveInsideHome(paths: DesignLibraryPaths, relativePath: string): string | null {
  const resolved = path.resolve(paths.home, relativePath);
  const root = path.resolve(paths.home);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/** The path form stored in summaries: relative to the app state directory. */
export function relativeToHome(paths: DesignLibraryPaths, absolutePath: string): string {
  return path.relative(paths.home, absolutePath).split(path.sep).join('/');
}
