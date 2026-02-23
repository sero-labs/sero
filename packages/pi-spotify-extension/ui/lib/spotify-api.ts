import type {
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUserProfile,
} from '../../shared/types';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

let requestSeq = 0;
const log = (tag: string, ...args: unknown[]) =>
  console.log(`[spotify-api][${tag}] t=${Date.now() % 100000}`, ...args);

const MAX_RETRIES = 2;
const DEFAULT_RETRY_MS = 1500;

/** Structured error with HTTP context so the UI can show actionable details. */
export class SpotifyApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly retryAfterSeconds: number | null;
  readonly detail: string | null;

  constructor(options: {
    status: number;
    endpoint: string;
    message: string;
    detail?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(options.message);
    this.name = 'SpotifyApiError';
    this.status = options.status;
    this.endpoint = options.endpoint;
    this.detail = options.detail ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }

  /** Human-readable summary for UI display. */
  toUserMessage(): string {
    const parts: string[] = [];

    if (this.status === 429) {
      parts.push('Spotify rate limit hit');
      if (this.retryAfterSeconds && this.retryAfterSeconds > 60) {
        const hours = Math.ceil(this.retryAfterSeconds / 3600);
        parts.push(`— this endpoint is blocked for ~${hours}h.`);
        parts.push('This usually happens when an app in Development Mode sends too many requests.');
        parts.push('Cached data will be used in the meantime.');
      } else if (this.retryAfterSeconds) {
        parts.push(`— retry in ${this.retryAfterSeconds}s.`);
      } else {
        parts.push('— Spotify didn\'t provide a retry time. This may be a long-duration block on a Development Mode app.');
      }
    } else if (this.status === 403) {
      parts.push(`Permission denied for ${this.endpoint}.`);
      if (this.detail?.toLowerCase().includes('scope')) {
        parts.push('Your token is missing required scopes — disconnect and reconnect to re-authorize.');
      }
    } else if (this.status === 401) {
      parts.push('Spotify session expired — reconnect to continue.');
    } else {
      parts.push(`Spotify error ${this.status}: ${this.message}`);
    }

    return parts.join(' ');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(response: Response): number {
  const header = response.headers.get('Retry-After') ?? response.headers.get('retry-after');
  if (!header) return DEFAULT_RETRY_MS;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds * 1000)
    : DEFAULT_RETRY_MS;
}

function getRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('Retry-After') ?? response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .trim();
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }
  if (typeof payload === 'string' && payload.length > 0) return payload;
  return `Spotify request failed (${status})`;
}

export async function spotifyApiRequest<T>(
  accessToken: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  const seq = ++requestSeq;
  const method = init.method ?? 'GET';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    log('req', `#${seq} ${method} ${endpoint}${attempt > 0 ? ` (retry ${attempt})` : ''}`);

    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 429) {
      const body = await parseResponse(response);
      const retryAfter = getRetryAfterSeconds(response);
      log('res', `#${seq} ${method} ${endpoint} → 429`,
        `Retry-After: ${retryAfter ?? 'none'}`,
        `body:`, body);

      // If the ban is long (>60s), don't bother retrying — fail fast so caller can use cached data.
      if (retryAfter && retryAfter > 60) {
        throw new SpotifyApiError({
          status: 429,
          endpoint,
          message: getErrorMessage(body, 429),
          retryAfterSeconds: retryAfter,
        });
      }

      if (attempt < MAX_RETRIES) {
        const waitMs = getRetryAfterMs(response);
        log('retry', `#${seq} waiting ${waitMs}ms before retry ${attempt + 1}`);
        await sleep(waitMs);
        continue;
      }
      throw new SpotifyApiError({
        status: 429,
        endpoint,
        message: getErrorMessage(body, 429),
        retryAfterSeconds: retryAfter,
      });
    }

    log('res', `#${seq} ${method} ${endpoint} → ${response.status}`);

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new SpotifyApiError({
        status: response.status,
        endpoint,
        message: getErrorMessage(payload, response.status),
        detail: typeof payload === 'string' ? payload : null,
      });
    }

    return payload as T;
  }

  throw new Error(`Spotify request failed after ${MAX_RETRIES} retries: ${method} ${endpoint}`);
}

function mapTrack(raw: unknown): SpotifyTrack | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.uri !== 'string' || typeof raw.name !== 'string') {
    return null;
  }

  const album = isRecord(raw.album) ? raw.album : null;
  const images = album && Array.isArray(album.images) ? album.images : [];
  const art = images.find((img) => isRecord(img) && typeof img.url === 'string') as
    | { url: string }
    | undefined;

  const artists = Array.isArray(raw.artists)
    ? raw.artists
      .map((artist) => (isRecord(artist) && typeof artist.name === 'string' ? artist.name : null))
      .filter((name): name is string => Boolean(name))
    : [];

  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artists,
    albumName: album && typeof album.name === 'string' ? album.name : 'Unknown album',
    albumArtUrl: art?.url ?? null,
    durationMs: typeof raw.duration_ms === 'number' ? raw.duration_ms : 0,
    explicit: Boolean(raw.explicit),
    previewUrl: typeof raw.preview_url === 'string' ? raw.preview_url : null,
  };
}

function mapPlaylist(raw: unknown): SpotifyPlaylist | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.uri !== 'string' || typeof raw.name !== 'string') {
    return null;
  }

  const owner = isRecord(raw.owner) ? raw.owner : null;
  // Spotify's API returns track counts under `tracks` or `items` depending
  // on app quota mode. Check both.
  const tracksMeta = isRecord(raw.tracks) ? raw.tracks : null;
  const itemsMeta = isRecord(raw.items) ? raw.items : null;
  const images = Array.isArray(raw.images) ? raw.images : [];
  const art = images.find((img) => isRecord(img) && typeof img.url === 'string') as
    | { url: string }
    | undefined;

  const totalTracks =
    (tracksMeta && typeof tracksMeta.total === 'number' ? tracksMeta.total : 0)
    || (itemsMeta && typeof itemsMeta.total === 'number' ? itemsMeta.total : 0);

  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    description: typeof raw.description === 'string' ? decodeHtml(raw.description) : '',
    imageUrl: art?.url ?? null,
    ownerName: owner && typeof owner.display_name === 'string' ? owner.display_name : 'Unknown owner',
    totalTracks,
    snapshotId: typeof raw.snapshot_id === 'string' ? raw.snapshot_id : null,
  };
}

function mapProfile(raw: unknown): SpotifyUserProfile {
  if (!isRecord(raw) || typeof raw.id !== 'string') {
    throw new Error('Invalid Spotify profile response');
  }

  const images = Array.isArray(raw.images) ? raw.images : [];
  const art = images.find((img) => isRecord(img) && typeof img.url === 'string') as
    | { url: string }
    | undefined;

  return {
    id: raw.id,
    displayName: typeof raw.display_name === 'string' ? raw.display_name : raw.id,
    email: typeof raw.email === 'string' ? raw.email : null,
    imageUrl: art?.url ?? null,
    product: typeof raw.product === 'string' ? raw.product : null,
    country: typeof raw.country === 'string' ? raw.country : null,
  };
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export async function fetchProfile(accessToken: string): Promise<SpotifyUserProfile> {
  const payload = await spotifyApiRequest<unknown>(accessToken, '/me');
  return mapProfile(payload);
}

export async function fetchPlaylists(
  accessToken: string,
  limit = 20,
): Promise<SpotifyPlaylist[]> {
  const payload = await spotifyApiRequest<{ items?: unknown[] }>(
    accessToken,
    `/me/playlists?limit=${Math.max(1, Math.min(50, Math.floor(limit)))}`,
  );

  return (payload.items ?? [])
    .map(mapPlaylist)
    .filter((item): item is SpotifyPlaylist => Boolean(item));
}

export async function fetchPlaylistTracks(
  accessToken: string,
  playlistId: string,
  limit = 100,
): Promise<SpotifyTrack[]> {
  // Use /items (not /tracks) — Spotify's Development Mode blocks the
  // /tracks endpoint with 403 but /items works identically.
  // Track data lives under `entry.item` instead of `entry.track`.
  const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const payload = await spotifyApiRequest<{ items?: Array<{ item?: unknown }> }>(
    accessToken,
    `/playlists/${encodeURIComponent(playlistId)}/items?limit=${clampedLimit}&additional_types=track`,
  );

  return (payload.items ?? [])
    .map((entry) => mapTrack(entry.item))
    .filter((item): item is SpotifyTrack => Boolean(item));
}

export async function searchTracks(
  accessToken: string,
  query: string,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const payload = await spotifyApiRequest<{ tracks?: { items?: unknown[] } }>(
    accessToken,
    `/search?type=track&q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(50, Math.floor(limit)))}`,
  );

  return (payload.tracks?.items ?? [])
    .map(mapTrack)
    .filter((item): item is SpotifyTrack => Boolean(item));
}

export async function recommendTracksFromQuery(
  accessToken: string,
  query: string,
  limit = 12,
): Promise<SpotifyTrack[]> {
  const seeds = await searchTracks(accessToken, query, 5);
  if (seeds.length === 0) return [];

  const seedIds = seeds
    .map((track) => track.id)
    .slice(0, 5)
    .join(',');

  const payload = await spotifyApiRequest<{ tracks?: unknown[] }>(
    accessToken,
    `/recommendations?limit=${Math.max(1, Math.min(50, Math.floor(limit)))}&seed_tracks=${seedIds}`,
  );

  return (payload.tracks ?? [])
    .map(mapTrack)
    .filter((item): item is SpotifyTrack => Boolean(item));
}

export async function fetchCurrentPlayback(accessToken: string): Promise<{
  isPaused: boolean;
  progressMs: number;
  deviceId: string | null;
  deviceName: string | null;
  volumePercent: number | null;
  track: SpotifyTrack | null;
}> {
  const payload = await spotifyApiRequest<unknown>(accessToken, '/me/player');
  if (!isRecord(payload)) {
    return {
      isPaused: true,
      progressMs: 0,
      deviceId: null,
      deviceName: null,
      volumePercent: null,
      track: null,
    };
  }

  const device = isRecord(payload.device) ? payload.device : null;
  return {
    isPaused: !Boolean(payload.is_playing),
    progressMs: typeof payload.progress_ms === 'number' ? payload.progress_ms : 0,
    deviceId: device && typeof device.id === 'string' ? device.id : null,
    deviceName: device && typeof device.name === 'string' ? device.name : null,
    volumePercent: device && typeof device.volume_percent === 'number' ? device.volume_percent : null,
    track: mapTrack(payload.item),
  };
}

export async function playPlaylist(
  accessToken: string,
  playlistId: string,
  deviceId?: string | null,
): Promise<void> {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  await spotifyApiRequest<unknown>(accessToken, `/me/player/play${query}`, {
    method: 'PUT',
    body: JSON.stringify({
      context_uri: `spotify:playlist:${playlistId}`,
    }),
  });
}

export async function playTracks(
  accessToken: string,
  uris: string[],
  deviceId?: string | null,
): Promise<void> {
  if (!uris.length) return;
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  await spotifyApiRequest<unknown>(accessToken, `/me/player/play${query}`, {
    method: 'PUT',
    body: JSON.stringify({ uris }),
  });
}

export async function pausePlayback(accessToken: string, deviceId?: string | null): Promise<void> {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  await spotifyApiRequest<unknown>(accessToken, `/me/player/pause${query}`, {
    method: 'PUT',
  });
}

export async function skipNext(accessToken: string): Promise<void> {
  await spotifyApiRequest<unknown>(accessToken, '/me/player/next', {
    method: 'POST',
  });
}

export async function skipPrevious(accessToken: string): Promise<void> {
  await spotifyApiRequest<unknown>(accessToken, '/me/player/previous', {
    method: 'POST',
  });
}
