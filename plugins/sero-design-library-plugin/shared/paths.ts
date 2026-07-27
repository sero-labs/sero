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
  /**
   * Record locks, deliberately outside the directories they guard: permanent
   * deletion removes an item's whole directory, and a lock kept inside it would
   * be destroyed while still held — releasing the mutex to another process
   * mid-transaction, and leaving this process to later delete that successor's
   * lock on the way out.
   */
  recordLocksDir: string;
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
    recordLocksDir: path.join(home, '.record-locks'),
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
  return path.join(paths.tombstonesDir, `${assertSafeId(itemId, 'item id')}.json`);
}

export function resolveDesignLibraryPaths(env: NodeJS.ProcessEnv = process.env): DesignLibraryPaths {
  return designLibraryPathsFromHome(path.join(resolveSeroHome(env), 'apps', 'design-library'));
}

/**
 * Ids arrive from tool callers, so they are untrusted input that gets used to
 * build paths — and one of those paths is handed to a recursive delete.
 * `path.join` offers no protection: `join(uploads, '../../..')` walks straight
 * out of the plugin's storage.
 *
 * Every id therefore has to be a single safe path segment. Validating inside
 * the path helpers rather than at each call site means a new call site cannot
 * forget: there is no way to build a plugin path from an id without passing
 * through here.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isSafeId(id: string): boolean {
  // The leading-character rule already excludes '.' and '..', and the class
  // excludes every separator, so no traversal survives.
  return SAFE_ID.test(id);
}

export function assertSafeId(id: string, kind: string): string {
  if (!isSafeId(id)) {
    throw new Error(`Refusing to use ${JSON.stringify(id)} as a ${kind}: it is not a safe identifier.`);
  }
  return id;
}

export function itemDir(paths: DesignLibraryPaths, itemId: string): string {
  return path.join(paths.itemsDir, assertSafeId(itemId, 'item id'));
}

export function itemRecordFile(paths: DesignLibraryPaths, itemId: string): string {
  return path.join(itemDir(paths, itemId), 'record.json');
}

export function jobFile(paths: DesignLibraryPaths, jobId: string): string {
  return path.join(paths.jobsDir, `${assertSafeId(jobId, 'job id')}.json`);
}

export function uploadDir(paths: DesignLibraryPaths, uploadId: string): string {
  return path.join(paths.uploadsDir, assertSafeId(uploadId, 'upload id'));
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
