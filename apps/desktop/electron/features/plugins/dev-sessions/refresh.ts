import { promises as fs } from 'fs';
import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';
import { clearPluginBridgePolicyCache } from '@electron/cli';
import { discoverAppCandidates } from '@electron/features/apps/discovery';
import { clearPackageCompatibilityCache } from '@electron/features/plugins/resource-compatibility';
import { reloadAllSessionResources } from '@electron/ipc/agent';
import {
  clearAppManifestCache,
  disposeAppSessionsForApp,
} from '@electron/ipc/agent/handlers/app-agent';
import { appRuntimeManager } from '@electron/features/apps/runtime/manager';
import { broadcastPluginEvent } from '@electron/ipc/integrations/plugin-events';
import { invalidatePackageProviderManifestCache } from '@electron/shared/providers/package-provider-manifests';
import { reconcileActiveDevSessionProjection } from './activation';
import { classifyPluginDevConflicts } from './conflicts';
import {
  ensurePluginDevServer,
  stopPluginDevServer,
} from './dev-server';
import {
  applyPluginDevServerResultToManifest,
  validatePluginDevSourceManifest,
} from './manifest';
import type { PluginDevSessionRecord } from './types';

const RETRY_DELAY_MS = 300;

type PluginDevSessionRefreshEffect = 'none' | 'updated' | 'deactivated';

type ValidationFailureKind = 'hard' | 'retryable' | 'soft';

export interface RefreshPluginDevSessionOptions {
  reason: 'manual' | 'file-change';
}

export interface RefreshPluginDevSessionResult {
  effect: PluginDevSessionRefreshEffect;
  record: PluginDevSessionRecord;
  activeManifest: SeroAppManifest | null;
  appId: string | null;
  event: PluginChangeEvent | null;
}

interface ResolvedPluginDevSession {
  manifest: SeroAppManifest;
  record: PluginDevSessionRecord;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown local plugin development error';
}

function createTimestamp(): string {
  return new Date().toISOString();
}

export function createBrokenPluginDevSessionRecord(
  record: PluginDevSessionRecord,
  error: unknown,
): PluginDevSessionRecord {
  return {
    ...record,
    status: 'broken',
    uiMode: 'unavailable',
    remoteEntryOverride: null,
    lastError: readErrorMessage(error),
    updatedAt: createTimestamp(),
  };
}

export function createValidatedPluginDevSessionRecord(
  record: PluginDevSessionRecord,
  options: {
    manifest: SeroAppManifest;
    remoteEntryOverride: string | null;
    uiMode: PluginDevSessionRecord['uiMode'];
    error?: string | null;
  },
): PluginDevSessionRecord {
  return {
    ...record,
    expectedAppId: options.manifest.id,
    lastKnownName: options.manifest.name,
    status: options.error ? 'needs-attention' : 'active',
    uiMode: options.uiMode,
    remoteEntryOverride: options.remoteEntryOverride,
    lastError: options.error ?? null,
    updatedAt: createTimestamp(),
  };
}

export function createSoftFailurePluginDevSessionRecord(
  record: PluginDevSessionRecord,
  error: unknown,
): PluginDevSessionRecord {
  return {
    ...record,
    status: record.status === 'broken' ? 'broken' : 'needs-attention',
    lastError: readErrorMessage(error),
    updatedAt: createTimestamp(),
  };
}

async function sourcePathExists(sourcePath: string): Promise<boolean> {
  try {
    await fs.access(sourcePath);
    return true;
  } catch {
    return false;
  }
}

async function classifyValidationFailure(
  record: PluginDevSessionRecord,
  error: unknown,
): Promise<ValidationFailureKind> {
  const message = readErrorMessage(error);

  if (message.includes('drifted from')) {
    return 'hard';
  }

  if (message.includes('already used by built-in app') || message.includes('already used by installed plugin')) {
    return 'hard';
  }

  if (message.includes('already owned by active local plugin development session')) {
    return 'hard';
  }

  if (!(await sourcePathExists(record.sourcePath))) {
    return 'hard';
  }

  if (
    message.includes('missing package.json')
    || message.includes('invalid package.json JSON')
    || message.includes('must define sero.app.id and sero.app.name')
    || message.includes('Failed to parse local plugin manifest')
  ) {
    return 'retryable';
  }

  return 'soft';
}

async function resolvePluginDevSession(
  record: PluginDevSessionRecord,
): Promise<ResolvedPluginDevSession> {
  const validated = await validatePluginDevSourceManifest(record.sourcePath, {
    expectedAppId: record.expectedAppId,
  });
  const conflicts = classifyPluginDevConflicts({
    appId: validated.manifest.id,
    sourcePath: validated.sourcePath,
    ignoreSessionId: record.sessionId,
    existingApps: await discoverAppCandidates(),
  });

  if (conflicts.length > 0) {
    throw new Error(conflicts[0]!.message);
  }

  const devServerResult = await ensurePluginDevServer({
    sourcePath: validated.sourcePath,
    declaredDevPort: validated.declaredDevPort,
    command: validated.devCommand,
    hasDeclaredUi: validated.hasDeclaredUi,
    hasBuiltUi: validated.hasBuiltUi,
  });
  const manifest = applyPluginDevServerResultToManifest(validated.manifest, devServerResult);

  if (devServerResult.uiMode !== 'dev-server') {
    await stopPluginDevServer(validated.sourcePath);
  }

  return {
    manifest,
    record: createValidatedPluginDevSessionRecord(record, {
      manifest,
      remoteEntryOverride: devServerResult.remoteEntryOverride,
      uiMode: devServerResult.uiMode,
      error: devServerResult.error ?? null,
    }),
  };
}

export async function refreshPluginDevSession(
  record: PluginDevSessionRecord,
  _options: RefreshPluginDevSessionOptions,
): Promise<RefreshPluginDevSessionResult> {
  try {
    const resolved = await resolvePluginDevSession(record);
    return {
      effect: 'updated',
      record: resolved.record,
      activeManifest: resolved.manifest,
      appId: resolved.manifest.id,
      event: { type: 'installed', manifest: resolved.manifest },
    };
  } catch (initialError) {
    const failureKind = await classifyValidationFailure(record, initialError);

    if (failureKind === 'hard') {
      await stopPluginDevServer(record.sourcePath);
      return {
        effect: 'deactivated',
        record: createBrokenPluginDevSessionRecord(record, initialError),
        activeManifest: null,
        appId: record.expectedAppId,
        event: record.expectedAppId
          ? { type: 'uninstalled', pluginId: record.expectedAppId }
          : null,
      };
    }

    if (failureKind === 'retryable') {
      await sleep(RETRY_DELAY_MS);

      try {
        const resolved = await resolvePluginDevSession(record);
        return {
          effect: 'updated',
          record: resolved.record,
          activeManifest: resolved.manifest,
          appId: resolved.manifest.id,
          event: { type: 'installed', manifest: resolved.manifest },
        };
      } catch (retryError) {
        await stopPluginDevServer(record.sourcePath);
        return {
          effect: 'deactivated',
          record: createBrokenPluginDevSessionRecord(record, retryError),
          activeManifest: null,
          appId: record.expectedAppId,
          event: record.expectedAppId
            ? { type: 'uninstalled', pluginId: record.expectedAppId }
            : null,
        };
      }
    }

    return {
      effect: 'none',
      record: createSoftFailurePluginDevSessionRecord(record, initialError),
      activeManifest: null,
      appId: null,
      event: null,
    };
  }
}

export async function applyPluginDevSessionRefreshEffects(options: {
  activeManifests: SeroAppManifest[];
  appId: string;
  event: PluginChangeEvent | null;
}): Promise<void> {
  await reconcileActiveDevSessionProjection(options.activeManifests);
  clearAppManifestCache();
  clearPluginBridgePolicyCache();
  clearPackageCompatibilityCache();
  invalidatePackageProviderManifestCache();
  disposeAppSessionsForApp(options.appId);
  await reloadAllSessionResources();
  await appRuntimeManager.restartApp(options.appId);

  if (options.event) {
    broadcastPluginEvent(options.event);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
