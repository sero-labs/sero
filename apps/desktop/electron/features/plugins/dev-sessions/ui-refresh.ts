import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';
import { applyPluginDevSessionManifestRemoteEntry } from './remote-entry';
import type { PluginDevSessionRecord } from './types';

export interface PluginDevSessionUiRefreshState {
  record: PluginDevSessionRecord;
  manifest: SeroAppManifest;
  event: PluginChangeEvent;
}

export function createPluginDevSessionUiRefreshState(
  record: PluginDevSessionRecord,
  manifest: SeroAppManifest,
): PluginDevSessionUiRefreshState {
  const nextRecord: PluginDevSessionRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  const nextManifest = applyPluginDevSessionManifestRemoteEntry(
    manifest,
    nextRecord.remoteEntryOverride,
    nextRecord.updatedAt,
  );

  return {
    record: nextRecord,
    manifest: nextManifest,
    event: {
      type: 'changed',
      pluginId: nextManifest.id,
      manifest: nextManifest,
      reason: 'dev-session-ui-changed',
    },
  };
}
