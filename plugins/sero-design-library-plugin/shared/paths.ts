/**
 * Plugin-owned storage layout.
 *
 * Everything lives under the resolved global app-state directory — the
 * directory that already contains `state.json`. No host change and no new IPC
 * is required to reach it: the runtime gets `ctx.stateFilePath`, and extension
 * tools resolve the same root from `SERO_HOME` / `PI_CODING_AGENT_DIR`.
 */

import path from 'node:path';
import os from 'node:os';

export const APP_ID = 'design-library';
export const STATE_FILE_NAME = 'state.json';

export interface StoragePaths {
  root: string;
  stateFile: string;
  items: string;
  designs: string;
  gallery: string;
  jobs: string;
  uploads: string;
  trash: string;
  exports: string;
}

/** Resolve the profile home Sero is running against. */
export function resolveSeroHome(env: NodeJS.ProcessEnv = process.env): string {
  const seroHome = env.SERO_HOME;
  if (seroHome) return seroHome;
  const agentDir = env.PI_CODING_AGENT_DIR;
  // PI_CODING_AGENT_DIR points at `<home>/agent`.
  if (agentDir) return path.dirname(agentDir);
  return path.join(os.homedir(), '.pi');
}

/** Storage root for the app: `<SERO_HOME>/apps/design-library`. */
export function resolveStorageRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveSeroHome(env), 'apps', APP_ID);
}

export function storagePathsFromRoot(root: string): StoragePaths {
  return {
    root,
    stateFile: path.join(root, STATE_FILE_NAME),
    items: path.join(root, 'items'),
    designs: path.join(root, 'designs'),
    gallery: path.join(root, 'gallery'),
    jobs: path.join(root, 'jobs'),
    uploads: path.join(root, 'uploads'),
    trash: path.join(root, 'trash'),
    exports: path.join(root, 'exports'),
  };
}

/** Storage paths derived from the runtime's `ctx.stateFilePath`. */
export function storagePathsFromStateFile(stateFilePath: string): StoragePaths {
  return storagePathsFromRoot(path.dirname(stateFilePath));
}

export function storagePathsFromEnv(env: NodeJS.ProcessEnv = process.env): StoragePaths {
  return storagePathsFromRoot(resolveStorageRoot(env));
}

export function itemDir(paths: StoragePaths, itemId: string): string {
  return path.join(paths.items, itemId);
}

export function itemRecordPath(paths: StoragePaths, itemId: string): string {
  return path.join(itemDir(paths, itemId), 'record.json');
}

export function designDir(paths: StoragePaths, designId: string): string {
  return path.join(paths.designs, designId);
}

export function designRecordPath(paths: StoragePaths, designId: string): string {
  return path.join(designDir(paths, designId), 'record.json');
}

export function variantDir(paths: StoragePaths, designId: string, variantId: string): string {
  return path.join(designDir(paths, designId), 'variants', variantId);
}

export function revisionDir(
  paths: StoragePaths,
  designId: string,
  variantId: string,
  revisionId: string,
): string {
  return path.join(variantDir(paths, designId, variantId), revisionId);
}

export function designAssetsRoot(paths: StoragePaths, designId: string): string {
  return path.join(designDir(paths, designId), 'assets');
}

export function designAssetDir(paths: StoragePaths, designId: string, assetId: string): string {
  return path.join(designAssetsRoot(paths, designId), assetId);
}

export function familyDir(paths: StoragePaths, familyId: string): string {
  return path.join(paths.gallery, familyId);
}

export function familyRecordPath(paths: StoragePaths, familyId: string): string {
  return path.join(familyDir(paths, familyId), 'family.json');
}

export function versionDir(paths: StoragePaths, familyId: string, versionId: string): string {
  return path.join(familyDir(paths, familyId), 'versions', versionId);
}

export function jobPath(paths: StoragePaths, jobId: string): string {
  return path.join(paths.jobs, `${jobId}.json`);
}

export function uploadDir(paths: StoragePaths, uploadId: string): string {
  return path.join(paths.uploads, uploadId);
}

/** Reject ids that could escape the storage root through a crafted tool call. */
export function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

export function assertSafeId(value: string, label: string): void {
  if (!isSafeId(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}
