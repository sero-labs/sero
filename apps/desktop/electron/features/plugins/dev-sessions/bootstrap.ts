import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';
import { applyPluginDevServerResultToManifest, type PluginDevSourceManifest } from './manifest';
import { createValidatedPluginDevSessionRecord } from './refresh';
import type { PluginDevSessionRecord } from './types';

export interface BootstrapSessionState {
  record: PluginDevSessionRecord;
  manifest: SeroAppManifest;
  shouldProbeDevServer: boolean;
}

function buildMissingDevPortError(sourcePath: string): string {
  return `Local plugin UI dev server requires sero.app.devPort in package.json: ${sourcePath}`;
}

function buildMissingDevCommandError(sourcePath: string): string {
  return `Local plugin UI dev server requires a scripts.dev command in package.json: ${sourcePath}`;
}

export function resolveBootstrapSessionState(
  record: PluginDevSessionRecord,
  validated: PluginDevSourceManifest,
): BootstrapSessionState {
  let uiMode: PluginDevSessionRecord['uiMode'];
  let error: string | null = null;
  let shouldProbeDevServer = false;
  let statusOverride: PluginDevSessionRecord['status'] | null = null;

  if (!validated.hasDeclaredUi) {
    uiMode = 'backend-only';
  } else if (!validated.declaredDevPort) {
    uiMode = validated.hasBuiltUi ? 'built-fallback' : 'unavailable';
    error = buildMissingDevPortError(validated.sourcePath);
  } else if (!validated.devCommand) {
    uiMode = validated.hasBuiltUi ? 'built-fallback' : 'unavailable';
    error = buildMissingDevCommandError(validated.sourcePath);
  } else {
    uiMode = validated.hasBuiltUi ? 'built-fallback' : 'unavailable';
    shouldProbeDevServer = true;
    statusOverride = 'starting';
  }

  const manifest = applyPluginDevServerResultToManifest(validated.manifest, {
    remoteEntryOverride: null,
    uiMode,
    error,
  });
  const nextRecord = createValidatedPluginDevSessionRecord(record, {
    manifest,
    remoteEntryOverride: null,
    uiMode,
    error,
  });

  return {
    manifest,
    shouldProbeDevServer,
    record: statusOverride
      ? {
          ...nextRecord,
          status: statusOverride,
          lastError: null,
        }
      : nextRecord,
  };
}

export function hasSessionPresentationChange(
  current: PluginDevSessionRecord,
  next: PluginDevSessionRecord,
): boolean {
  return current.expectedAppId !== next.expectedAppId
    || current.lastKnownName !== next.lastKnownName
    || current.status !== next.status
    || current.uiMode !== next.uiMode
    || current.remoteEntryOverride !== next.remoteEntryOverride
    || current.lastError !== next.lastError;
}

export function hasManifestProjectionChange(
  current: SeroAppManifest | null,
  next: SeroAppManifest | null,
): boolean {
  if (!current && !next) return false;
  if (!current || !next) return true;

  return current.component !== next.component
    || current.uiEntry !== next.uiEntry
    || current.remoteEntryOverride !== next.remoteEntryOverride;
}

export function buildBootstrapSessionEvent(
  current: PluginDevSessionRecord,
  next: PluginDevSessionRecord,
  manifest: SeroAppManifest | null,
): PluginChangeEvent | null {
  const pluginId = next.expectedAppId ?? current.expectedAppId ?? manifest?.id ?? null;
  if (!pluginId) {
    return null;
  }

  return {
    type: 'changed',
    pluginId,
    manifest: manifest ?? undefined,
    reason: next.status === 'broken' ? 'dev-session-stopped' : 'dev-session-refreshed',
  };
}
