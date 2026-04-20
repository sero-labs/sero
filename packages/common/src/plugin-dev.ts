/**
 * Renderer-safe local plugin development session types shared across
 * preload, renderer, and federated Admin surfaces.
 */
export type PluginDevSessionStatus = 'starting' | 'active' | 'needs-attention' | 'broken';

export type PluginDevSessionUiMode = 'dev-server' | 'built-fallback' | 'backend-only' | 'unavailable';

/**
 * Serialized dev-session state surfaced over IPC.
 *
 * `appId`/`name` may be null for broken persisted sessions where the source
 * folder no longer parses cleanly, but the session record still needs to stay
 * visible for recovery.
 */
export interface PluginDevSessionIPC {
  sessionId: string;
  appId: string | null;
  name: string | null;
  sourcePath: string;
  status: PluginDevSessionStatus;
  uiMode: PluginDevSessionUiMode;
  remoteEntryOverride: string | null;
  lastError: string | null;
  updatedAt: string;
}
