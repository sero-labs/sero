/**
 * Shared types for the Sero Admin app.
 *
 * The admin app is stateless — it reads/writes config files directly.
 * The "state" here is just UI preferences (last opened tab, etc.).
 */

// ── App state (persisted) ──────────────────────────────────

export interface AdminState {
  /** Last active tab. */
  lastTab: 'config' | 'logs' | 'sessions';
  /** Last opened config file key. */
  lastConfigKey: string | null;
  /** Last opened session filename. */
  lastSessionFile: string | null;
}

export const DEFAULT_STATE: AdminState = {
  lastTab: 'config',
  lastConfigKey: null,
  lastSessionFile: null,
};

// ── Config file descriptors ────────────────────────────────

export interface ConfigFile {
  /** Unique key for the config (e.g. 'settings', 'auth'). */
  key: string;
  /** Display name. */
  label: string;
  /** Relative path from profile root / agent dir. */
  relativePath: string;
  /** Brief description of what this config controls. */
  description: string;
  /** If true, mask sensitive values in display. */
  sensitive?: boolean;
  /** If true, file is read-only (no save). */
  readOnly?: boolean;
}

/** Known config files in a Sero profile. */
export const CONFIG_FILES: ConfigFile[] = [
  {
    key: 'settings',
    label: 'Settings',
    relativePath: 'agent/settings.json',
    description: 'Default model, provider, thinking level, and registered packages',
  },
  {
    key: 'auth',
    label: 'Auth',
    relativePath: 'agent/auth.json',
    description: 'API keys and auth tokens for LLM providers',
    sensitive: true,
  },
  {
    key: 'layout',
    label: 'Layout',
    relativePath: 'agent/layout.json',
    description: 'UI layout state — sidebar, chat panel, theme, active app',
  },
  {
    key: 'workspaces',
    label: 'Workspaces',
    relativePath: 'agent/workspaces.json',
    description: 'Registered workspaces and their paths',
  },
  {
    key: 'profiles',
    label: 'Profiles',
    relativePath: '../profiles.json',
    description: 'Profile registry — all profiles and active profile ID',
  },
  {
    key: 'env',
    label: 'Environment',
    relativePath: 'agent/.env',
    description: 'Environment variables for extensions (API keys, etc.)',
    sensitive: true,
    readOnly: true,
  },
];

// ── Session metadata ───────────────────────────────────────

export interface SessionMeta {
  /** Filename of the session file. */
  filename: string;
  /** Session ID (UUID). */
  sessionId: string;
  /** ISO timestamp extracted from filename. */
  timestamp: string;
  /** Human-readable date. */
  dateLabel: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Human-readable size. */
  sizeLabel: string;
  /** Number of JSONL lines (messages). */
  lineCount: number;
}

// ── Session message (parsed from JSONL) ────────────────────

export interface SessionMessage {
  /** Line index in the JSONL file (0-based). */
  lineIndex: number;
  /** The raw parsed JSON object. */
  data: Record<string, unknown>;
  /** Message type (from data.type). */
  type: string;
  /** Role if it's a message (user, assistant, toolResult). */
  role?: string;
  /** Short preview text. */
  preview: string;
  /** Timestamp if available. */
  timestamp?: string;
}

// ── Log file info ──────────────────────────────────────────

export interface LogFile {
  /** Display name. */
  label: string;
  /** Absolute path. */
  path: string;
  /** File size in bytes (0 if missing). */
  sizeBytes: number;
  /** Human-readable size. */
  sizeLabel: string;
}
