import os from 'node:os';
import path from 'node:path';

import { isSafeId } from './safe-id';
export { isSafeId } from './safe-id';

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
  itemsIndexFile: string;
  designsDir: string;
  designsIndexFile: string;
  jobsDir: string;
  jobsIndexFile: string;
  exportsDir: string;
  exportsIndexFile: string;
  uploadsDir: string;
  tombstonesDir: string;
  galleryDir: string;
  galleryIndexFile: string;
  /**
   * The user-supplied provider key, written `0600` (spec §8.3). Deliberately a
   * file rather than reactive state: state is read by the UI, and the key must
   * never reach it.
   */
  secretsFile: string;
}

export function designLibraryPathsFromHome(home: string): DesignLibraryPaths {
  return {
    home,
    stateFile: path.join(home, 'state.json'),
    lockDir: path.join(home, '.state.lock'),
    recordLocksDir: path.join(home, '.record-locks'),
    itemsDir: path.join(home, 'items'),
    itemsIndexFile: path.join(home, 'items', 'index.json'),
    designsDir: path.join(home, 'designs'),
    designsIndexFile: path.join(home, 'designs', 'index.json'),
    jobsDir: path.join(home, 'jobs'),
    jobsIndexFile: path.join(home, 'jobs', 'index.json'),
    exportsDir: path.join(home, 'exports'),
    exportsIndexFile: path.join(home, 'exports', 'index.json'),
    uploadsDir: path.join(home, 'uploads'),
    tombstonesDir: path.join(home, 'tombstones'),
    galleryDir: path.join(home, 'gallery'),
    galleryIndexFile: path.join(home, 'gallery', 'index.json'),
    secretsFile: path.join(home, 'secrets.json'),
  };
}

export function secretsFile(paths: DesignLibraryPaths): string {
  return paths.secretsFile;
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

export function designDir(paths: DesignLibraryPaths, designId: string): string {
  return path.join(paths.designsDir, assertSafeId(designId, 'design id'));
}

export function designRecordFile(paths: DesignLibraryPaths, designId: string): string {
  return path.join(designDir(paths, designId), 'record.json');
}

export function variantDir(paths: DesignLibraryPaths, designId: string, variantId: string): string {
  return path.join(designDir(paths, designId), 'variants', assertSafeId(variantId, 'variant id'));
}

/**
 * One directory per revision, holding the files the model authored and the
 * assembled preview document built from them. Revisions are append-only, so a
 * new attempt never overwrites the files an earlier one produced.
 */
export function revisionDir(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  revisionId: string,
): string {
  return path.join(variantDir(paths, designId, variantId), assertSafeId(revisionId, 'revision id'));
}

/**
 * Generated media belongs to the Design, not to a variant: the same artwork is
 * reusable across variants and outlives any one of them (spec §6.6).
 */
export function designAssetsDir(paths: DesignLibraryPaths, designId: string): string {
  return path.join(designDir(paths, designId), 'assets');
}

export function designAssetDir(
  paths: DesignLibraryPaths,
  designId: string,
  assetId: string,
): string {
  return path.join(designAssetsDir(paths, designId), assertSafeId(assetId, 'asset id'));
}

/**
 * One directory per Gallery family, holding its versions (spec §9.1).
 *
 * The family record is mutable — the featured pointer moves, the family can be
 * deleted and restored — while everything under `versions/` is written once and
 * never touched again, including its own copies of every asset.
 */
export function galleryFamilyDir(paths: DesignLibraryPaths, familyId: string): string {
  return path.join(paths.galleryDir, assertSafeId(familyId, 'gallery family id'));
}

export function galleryFamilyRecordFile(paths: DesignLibraryPaths, familyId: string): string {
  return path.join(galleryFamilyDir(paths, familyId), 'record.json');
}

export function galleryVersionDir(
  paths: DesignLibraryPaths,
  familyId: string,
  versionId: string,
): string {
  return path.join(
    galleryFamilyDir(paths, familyId),
    'versions',
    assertSafeId(versionId, 'gallery version id'),
  );
}

export function galleryVersionRecordFile(
  paths: DesignLibraryPaths,
  familyId: string,
  versionId: string,
): string {
  return path.join(galleryVersionDir(paths, familyId, versionId), 'record.json');
}

export function jobFile(paths: DesignLibraryPaths, jobId: string): string {
  return path.join(paths.jobsDir, `${assertSafeId(jobId, 'job id')}.json`);
}

export function exportFile(paths: DesignLibraryPaths, exportId: string): string {
  return path.join(paths.exportsDir, `${assertSafeId(exportId, 'export id')}.json`);
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
