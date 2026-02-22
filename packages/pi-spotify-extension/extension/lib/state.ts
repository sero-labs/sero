import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { SpotifyAppState, SpotifyPlaylist, SpotifyTrack } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';

const GLOBAL_STATE_REL_PATH = path.join('apps', 'spotify', 'state.json');
const WORKSPACE_STATE_REL_PATH = path.join('.sero', 'apps', 'spotify', 'state.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneDefaultState(): SpotifyAppState {
  return JSON.parse(JSON.stringify(DEFAULT_STATE)) as SpotifyAppState;
}

function normaliseState(raw: unknown): SpotifyAppState {
  const base = cloneDefaultState();
  if (!isRecord(raw)) return base;

  const parsed = raw as Partial<SpotifyAppState>;
  const auth = isRecord(parsed.auth) ? parsed.auth : {};
  const playback = isRecord(parsed.playback) ? parsed.playback : {};

  return {
    ...base,
    ...parsed,
    auth: {
      ...base.auth,
      ...auth,
    },
    playback: {
      ...base.playback,
      ...playback,
    },
    playlists: Array.isArray(parsed.playlists)
      ? (parsed.playlists as SpotifyPlaylist[])
      : base.playlists,
    tracksByPlaylist: isRecord(parsed.tracksByPlaylist)
      ? (parsed.tracksByPlaylist as Record<string, SpotifyTrack[]>)
      : base.tracksByPlaylist,
    lastRecommendations: Array.isArray(parsed.lastRecommendations)
      ? (parsed.lastRecommendations as SpotifyTrack[])
      : base.lastRecommendations,
  };
}

export function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, GLOBAL_STATE_REL_PATH);
  }
  return path.join(cwd, WORKSPACE_STATE_REL_PATH);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export async function readState(filePath: string): Promise<SpotifyAppState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normaliseState(JSON.parse(raw));
  } catch {
    return cloneDefaultState();
  }
}

export async function writeState(filePath: string, state: SpotifyAppState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
