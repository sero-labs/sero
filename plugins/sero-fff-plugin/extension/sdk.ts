/**
 * Lazy loader for the native FFF SDK.
 *
 * The native library is resolved through `ffi-rs` the first time a finder is
 * created, so an unavailable binary must surface as a normal tool error rather
 * than a session that refuses to open. `loadFinderSdk()` therefore resolves to
 * a discriminated result instead of throwing.
 *
 * Pi reloads extension modules with `jiti` (module cache off), so the resolved
 * module is cached on `globalThis`: re-importing the native module graph on
 * every `/reload` would re-open the library.
 */

import type { FileFinderApi, InitOptions, Result } from '@ff-labs/fff-node';

/** The subset of `FileFinder` statics this plugin depends on. */
export interface FileFinderStatic {
  create(options: InitOptions): Result<FileFinderApi>;
}

export type FinderSdk =
  | { ok: true; FileFinder: FileFinderStatic }
  | { ok: false; error: string };

const SDK_CACHE_KEY = '__seroFffSdkPromise';

type SdkGlobal = typeof globalThis & {
  [SDK_CACHE_KEY]?: Promise<FinderSdk>;
};

async function importSdk(): Promise<FinderSdk> {
  try {
    const mod = await import('@ff-labs/fff-node');
    return { ok: true, FileFinder: mod.FileFinder };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function loadFinderSdk(): Promise<FinderSdk> {
  const scope = globalThis as SdkGlobal;
  const cached = scope[SDK_CACHE_KEY];
  if (cached) return cached;

  const pending = importSdk();
  scope[SDK_CACHE_KEY] = pending;
  return pending;
}

/** Test seam: drops the cached SDK so a suite can install its own stub. */
export function resetFinderSdkCache(): void {
  delete (globalThis as SdkGlobal)[SDK_CACHE_KEY];
}

/** Test seam: installs a stub SDK for the process. */
export function setFinderSdkForTesting(sdk: FinderSdk): void {
  (globalThis as SdkGlobal)[SDK_CACHE_KEY] = Promise.resolve(sdk);
}
