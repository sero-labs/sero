/**
 * Hooks for reading Sero config/session files via the appState IPC bridge.
 *
 * Uses `window.sero.appState.read()` for JSON files and
 * `window.sero.appState.readText()` for raw text (logs, .env).
 *
 * All window.sero access goes through getSero() — the single cast site.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigFile } from '../../shared/types';
import { CONFIG_FILES } from '../../shared/types';
import { formatDate } from '../lib/format';

// ── Types ──────────────────────────────────────────────────

import type { InstalledPlugin } from '@sero/common';

export type ProviderTierDefaults = Partial<Record<'LOW' | 'MED' | 'HIGH', string>>;
export type ProviderModelDefaults = Record<string, ProviderTierDefaults>;

export interface ProviderDefaultsState {
  builtInDefaults: ProviderModelDefaults;
  globalDefaults: ProviderModelDefaults;
  profileOverrides?: ProviderModelDefaults;
  effectiveDefaults: ProviderModelDefaults;
}

export interface SeroApi {
  appState: {
    read(filePath: string): Promise<unknown>;
    readText(filePath: string): Promise<string | null>;
    write(filePath: string, data: unknown): Promise<void>;
  };
  profiles: {
    list(): Promise<ProfileInfo[]>;
    getActive(): Promise<ProfileInfo | null>;
  };
  sessions: {
    list(): Promise<SeroSessionInfo[]>;
  };
  apps: {
    discover(): Promise<{ id: string; name: string }[]>;
  };
  shell: {
    showItemInFolder(path: string): Promise<void>;
  };
  plugins: {
    list(): Promise<InstalledPlugin[]>;
    install(source: string): Promise<{ id: string; name: string }>;
    uninstall(pluginId: string): Promise<void>;
    /** Callback receives the raw IPC event; hook only uses it as a reload signal. */
    onChanged(callback: (event: unknown) => void): () => void;
  };
  skills: {
    listAvailableSkills(): Promise<AvailableSkillInfo[]>;
    setDisabledModelSkills(skillNames: string[]): Promise<void>;
  };
  providerDefaults: {
    get(): Promise<ProviderDefaultsState>;
    setGlobalDefaults(defaults: ProviderModelDefaults): Promise<void>;
  };
}

interface ProfileInfo {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  isActive: boolean;
}

interface SeroSessionInfo {
  id: string;
  path: string;
  name?: string;
  created: string;
  modified: string;
  workspaceId: string;
  messageCount: number;
  firstMessage: string;
}

export interface AvailableSkillInfo {
  name: string;
  description: string;
  source: string;
  disableModelInvocation: boolean;
}

/** Single cast site for the window.sero API. Import this instead of casting inline. */
export function getSero(): SeroApi {
  return (window as unknown as { sero: SeroApi }).sero;
}

// ── useProfiles ────────────────────────────────────────────

export function useProfiles() {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const sero = getSero();
        const [list, active] = await Promise.all([
          sero.profiles.list(),
          sero.profiles.getActive(),
        ]);
        if (!cancelled) {
          setProfiles(list);
          setActiveProfile(active);
        }
      } catch (err) {
        console.error('[admin] Failed to load profiles:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return { profiles, activeProfile, loading };
}

// ── useConfigFile ──────────────────────────────────────────

export function useConfigFile(profilePath: string | null, configKey: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const configFile = configKey
    ? CONFIG_FILES.find((c) => c.key === configKey) ?? null
    : null;

  const filePath = profilePath && configFile
    ? resolveConfigPath(profilePath, configFile)
    : null;

  const isTextFile = configFile ? !configFile.relativePath.endsWith('.json') : false;

  // Load file content
  useEffect(() => {
    if (!filePath) {
      setContent(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const sero = getSero();
        if (isTextFile) {
          const text = await sero.appState.readText(filePath);
          if (!cancelled) setContent(text);
        } else {
          const data = await sero.appState.read(filePath);
          if (!cancelled) {
            setContent(data !== null ? JSON.stringify(data, null, 2) : null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to read file');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [filePath, isTextFile]);

  // Save handler — supports both JSON and plain text files
  const save = useCallback(async (newContent: string) => {
    if (!filePath) return;
    setSaving(true);
    setError(null);
    try {
      if (isTextFile) {
        // For text files (.env), write raw content via writeText
        // The appState.write serialises as JSON, so we need the text path
        const sero = getSero();
        // writeText doesn't exist yet — fall back to write with a string wrapper
        // that the main process will handle. For now, text files are read-only.
        throw new Error('Saving text files is not yet supported');
        void sero; // unreachable but satisfies lint
      } else {
        const parsed = JSON.parse(newContent);
        const sero = getSero();
        await sero.appState.write(filePath, parsed);
        setContent(newContent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [filePath, isTextFile]);

  // Reload handler
  const reload = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    try {
      const sero = getSero();
      if (isTextFile) {
        const text = await sero.appState.readText(filePath);
        setContent(text);
      } else {
        const data = await sero.appState.read(filePath);
        setContent(data !== null ? JSON.stringify(data, null, 2) : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload');
    } finally {
      setLoading(false);
    }
  }, [filePath, isTextFile]);

  return { content, loading, error, saving, configFile, save, reload };
}

// ── Helpers ────────────────────────────────────────────────

function resolveConfigPath(profilePath: string, cf: ConfigFile): string {
  if (cf.relativePath.startsWith('../')) {
    // profiles.json lives one level above the profile
    const parent = profilePath.replace(/\/[^/]+\/?$/, '');
    return `${parent}/${cf.relativePath.replace('../', '')}`;
  }
  return `${profilePath}/${cf.relativePath}`;
}

// ── useSessionFiles ────────────────────────────────────────

export interface SessionFileInfo {
  filename: string;
  sessionId: string;
  timestamp: string;
  dateLabel: string;
  sizeBytes: number;
  sizeLabel: string;
  name: string;
  messageCount: number;
  workspaceId: string;
}

/** List session files via the sessions API (lightweight metadata, no file reads). */
export function useSessionFiles() {
  const [sessions, setSessions] = useState<SessionFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const sero = getSero();
      const list = await sero.sessions.list();
      const mapped: SessionFileInfo[] = list.map((s) => ({
        filename: s.path.split('/').pop() || s.id,
        sessionId: s.id,
        timestamp: s.created,
        dateLabel: formatDate(s.created),
        sizeBytes: 0,
        sizeLabel: '',
        name: s.name || s.firstMessage || '',
        messageCount: s.messageCount,
        workspaceId: s.workspaceId,
      }));
      // Sort by date descending
      mapped.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setSessions(mapped);
    } catch (err) {
      console.error('[admin] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      reload();
    }
  }, [reload]);

  return { sessions, loading, reload };
}
