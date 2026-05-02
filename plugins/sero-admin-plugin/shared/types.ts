/**
 * Shared types for the Sero Admin app.
 *
 * The admin app is stateless — it reads/writes config files directly.
 * The "state" here is just UI preferences (last opened tab, etc.).
 */

// ── App state (persisted) ──────────────────────────────────

export type AdminSection =
  | 'agents' | 'skills' | 'prompts'
  | 'settings' | 'model' | 'plugins'
  | 'logs' | 'sessions';

export interface AdminState {
  lastSection: AdminSection;
  lastConfigKey: string | null;
  lastSessionFile: string | null;
  lastAgent: string | null;
  lastSkill: string | null;
  lastPrompt: string | null;
}

export const DEFAULT_STATE: AdminState = {
  lastSection: 'agents',
  lastConfigKey: null,
  lastSessionFile: null,
  lastAgent: null,
  lastSkill: null,
  lastPrompt: null,
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
    description: 'Default model, provider, thinking level, packages, skill visibility, and memory logging policy',
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

