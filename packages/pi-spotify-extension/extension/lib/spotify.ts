import type {
  SpotifyAppState,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUserProfile,
} from '../../shared/types';
import { nowISO, writeState } from './state';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const TOKEN_REFRESH_WINDOW_MS = 90_000;

export type SpotifyResponse<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function spotifyRequest<T>(
  accessToken: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<SpotifyResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers ? (init.headers as Record<string, string>) : {}),
  };

  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  const text = await response.text();
  const payload = text ? parseJson(text) : null;

  if (!response.ok) {
    const message =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string'
        ? payload.error.message
        : `Spotify request failed (${response.status})`;
    return { ok: false, status: response.status, message };
  }

  return { ok: true, data: payload as T };
}

function cleanDescription(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .trim();
}

export function mapTrack(raw: unknown): SpotifyTrack | null {
  if (!isRecord(raw)) return null;

  const artists = Array.isArray(raw.artists)
    ? raw.artists
        .map((artist) =>
          isRecord(artist) && typeof artist.name === 'string' ? artist.name : null,
        )
        .filter((name): name is string => Boolean(name))
    : [];

  const album = isRecord(raw.album) ? raw.album : null;
  const images = album && Array.isArray(album.images) ? album.images : [];
  const firstImage = images.find(
    (img) => isRecord(img) && typeof img.url === 'string',
  ) as { url: string } | undefined;

  if (
    typeof raw.id !== 'string'
    || typeof raw.uri !== 'string'
    || typeof raw.name !== 'string'
  ) {
    return null;
  }

  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artists,
    albumName: album && typeof album.name === 'string' ? album.name : 'Unknown album',
    albumArtUrl: firstImage?.url ?? null,
    durationMs: typeof raw.duration_ms === 'number' ? raw.duration_ms : 0,
    explicit: Boolean(raw.explicit),
    previewUrl: typeof raw.preview_url === 'string' ? raw.preview_url : null,
  };
}

export function mapPlaylist(raw: unknown): SpotifyPlaylist | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.uri !== 'string' || typeof raw.name !== 'string') {
    return null;
  }

  const images = Array.isArray(raw.images) ? raw.images : [];
  const firstImage = images.find(
    (img) => isRecord(img) && typeof img.url === 'string',
  ) as { url: string } | undefined;
  const owner = isRecord(raw.owner) ? raw.owner : null;
  const tracks = isRecord(raw.tracks) ? raw.tracks : null;

  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    description: typeof raw.description === 'string' ? cleanDescription(raw.description) : '',
    imageUrl: firstImage?.url ?? null,
    ownerName:
      owner && typeof owner.display_name === 'string'
        ? owner.display_name
        : 'Unknown owner',
    totalTracks: tracks && typeof tracks.total === 'number' ? tracks.total : 0,
    snapshotId: typeof raw.snapshot_id === 'string' ? raw.snapshot_id : null,
  };
}

export function mapProfile(raw: unknown): SpotifyUserProfile | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const images = Array.isArray(raw.images) ? raw.images : [];
  const firstImage = images.find(
    (img) => isRecord(img) && typeof img.url === 'string',
  ) as { url: string } | undefined;

  return {
    id: raw.id,
    displayName: typeof raw.display_name === 'string' ? raw.display_name : raw.id,
    email: typeof raw.email === 'string' ? raw.email : null,
    imageUrl: firstImage?.url ?? null,
    product: typeof raw.product === 'string' ? raw.product : null,
    country: typeof raw.country === 'string' ? raw.country : null,
  };
}

function tokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return true;
  return expiry - Date.now() < TOKEN_REFRESH_WINDOW_MS;
}

async function refreshAccessToken(
  state: SpotifyAppState,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!state.auth.refreshToken || !state.auth.clientId) {
    return {
      ok: false,
      error: 'Spotify is not connected yet. Connect it from the Spotify app first.',
    };
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: state.auth.refreshToken,
    client_id: state.auth.clientId,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payloadText = await response.text();
  const payload = payloadText ? parseJson(payloadText) : null;

  if (!response.ok || !isRecord(payload) || typeof payload.access_token !== 'string') {
    const message =
      isRecord(payload) && typeof payload.error_description === 'string'
        ? payload.error_description
        : 'Failed to refresh Spotify token';
    return { ok: false, error: message };
  }

  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  state.auth.accessToken = payload.access_token;
  state.auth.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  if (typeof payload.refresh_token === 'string' && payload.refresh_token.length > 0) {
    state.auth.refreshToken = payload.refresh_token;
  }
  if (typeof payload.scope === 'string') {
    state.auth.scope = payload.scope;
  }
  state.updatedAt = nowISO();

  return { ok: true };
}

export async function ensureAccessToken(
  statePath: string,
  state: SpotifyAppState,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!state.auth.accessToken && !state.auth.refreshToken) {
    return {
      ok: false,
      error: 'Spotify is disconnected. Open the Spotify app in Sero and connect first.',
    };
  }

  if (!state.auth.accessToken || tokenExpired(state.auth.expiresAt)) {
    const refreshed = await refreshAccessToken(state);
    if (!refreshed.ok) {
      return { ok: false, error: refreshed.error };
    }
    await writeState(statePath, state);
  }

  if (!state.auth.accessToken) {
    return { ok: false, error: 'No Spotify access token available.' };
  }

  return { ok: true, token: state.auth.accessToken };
}

export function clampLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(value)));
}
