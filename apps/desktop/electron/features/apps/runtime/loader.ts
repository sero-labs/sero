import path from 'path';
import { pathToFileURL } from 'url';
import type { AppRuntimeModule } from './types';

const SUPPORTED_RUNTIME_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function normalizeRuntimeModule(candidate: unknown, runtimeEntryPath: string): AppRuntimeModule {
  if (
    typeof candidate === 'object'
    && candidate !== null
    && 'createAppRuntime' in candidate
    && typeof candidate.createAppRuntime === 'function'
  ) {
    return candidate as AppRuntimeModule;
  }

  throw new Error(
    `Invalid app runtime module at ${runtimeEntryPath}: expected a createAppRuntime() export.`,
  );
}

export async function loadAppRuntimeModule(runtimeEntryPath: string): Promise<AppRuntimeModule> {
  const extension = path.extname(runtimeEntryPath).toLowerCase();
  if (!SUPPORTED_RUNTIME_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported app runtime entry ${runtimeEntryPath}. ` +
      'Runtime entries must resolve to .js, .mjs, or .cjs files.',
    );
  }

  const runtimeUrl = `${pathToFileURL(runtimeEntryPath).href}?t=${Date.now()}`;
  const imported = await import(runtimeUrl);

  if (typeof imported.createAppRuntime === 'function') {
    return normalizeRuntimeModule(imported, runtimeEntryPath);
  }

  return normalizeRuntimeModule(imported.default, runtimeEntryPath);
}
