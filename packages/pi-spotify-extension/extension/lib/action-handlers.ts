import type { SpotifyAppState, SpotifyPlaylist, SpotifyTrack } from '../../shared/types';
import {
  clampLimit,
  ensureAccessToken,
  mapPlaylist,
  mapProfile,
  mapTrack,
  spotifyRequest,
} from './spotify';
import { nowISO, writeState } from './state';

export type SpotifyToolAction =
  | 'connection_status'
  | 'list_playlists'
  | 'search_tracks'
  | 'suggest_songs'
  | 'create_playlist'
  | 'add_tracks'
  | 'start_playlist'
  | 'pause_playback'
  | 'next_track'
  | 'previous_track';

export interface SpotifyToolParams {
  action: SpotifyToolAction;
  query?: string;
  limit?: number;
  playlistId?: string;
  playlistName?: string;
  playlistDescription?: string;
  makePublic?: boolean;
  trackUris?: string[];
  deviceId?: string;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, never>;
  isError?: boolean;
}

function makeResult(text: string, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text }],
    details: {},
    ...(isError ? { isError: true } : {}),
  };
}

export async function executeSpotifyAction(args: {
  params: SpotifyToolParams;
  statePath: string;
  state: SpotifyAppState;
}): Promise<ToolResult> {
  const { params, statePath, state } = args;

  const withToken = async () => {
    const tokenResult = await ensureAccessToken(statePath, state);
    if (!tokenResult.ok) {
      return {
        ok: false as const,
        result: makeResult(`Error: ${tokenResult.error}`, true),
      };
    }
    return { ok: true as const, token: tokenResult.token };
  };

  switch (params.action) {
    case 'connection_status': {
      if (!state.auth.accessToken && !state.auth.refreshToken) {
        return makeResult(
          'Spotify is not connected. Open the Spotify app in Sero and connect your account first.',
          true,
        );
      }

      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const me = await spotifyRequest<unknown>(tokenResult.token, '/me');
      if (!me.ok) {
        return makeResult(`Error: ${me.message}`, true);
      }

      const profile = mapProfile(me.data);
      if (profile) {
        state.profile = profile;
        state.updatedAt = nowISO();
        await writeState(statePath, state);
      }

      return makeResult(
        [
          `Connected as ${profile?.displayName ?? 'unknown user'} (${profile?.id ?? 'n/a'})`,
          `Plan: ${profile?.product ?? 'unknown'}`,
          `Playlists cached: ${state.playlists.length}`,
          `Playback device: ${state.playback.deviceName ?? 'not ready'}`,
        ].join('\n'),
      );
    }

    case 'list_playlists': {
      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const limit = clampLimit(params.limit, 20);
      const response = await spotifyRequest<{ items: unknown[] }>(
        tokenResult.token,
        `/me/playlists?limit=${limit}`,
      );
      if (!response.ok) return makeResult(`Error: ${response.message}`, true);

      const playlists = response.data.items
        .map(mapPlaylist)
        .filter((item): item is SpotifyPlaylist => Boolean(item));

      state.playlists = playlists;
      state.updatedAt = nowISO();
      await writeState(statePath, state);

      if (!playlists.length) return makeResult('No playlists found.');

      const text = playlists
        .map(
          (playlist, index) =>
            `${index + 1}. ${playlist.name} (${playlist.totalTracks} tracks) [${playlist.id}]`,
        )
        .join('\n');
      return makeResult(text);
    }

    case 'search_tracks': {
      if (!params.query?.trim()) {
        return makeResult('Error: query is required for search_tracks', true);
      }

      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const limit = clampLimit(params.limit, 10);
      const query = encodeURIComponent(params.query.trim());
      const response = await spotifyRequest<{ tracks?: { items?: unknown[] } }>(
        tokenResult.token,
        `/search?type=track&limit=${limit}&q=${query}`,
      );
      if (!response.ok) return makeResult(`Error: ${response.message}`, true);

      const tracks = (response.data.tracks?.items ?? [])
        .map(mapTrack)
        .filter((item): item is SpotifyTrack => Boolean(item));

      if (!tracks.length) return makeResult(`No tracks found for "${params.query}".`);

      const text = tracks
        .map(
          (track, index) =>
            `${index + 1}. ${track.name} — ${track.artists.join(', ')} (${track.uri})`,
        )
        .join('\n');
      return makeResult(text);
    }

    case 'suggest_songs': {
      if (!params.query?.trim()) {
        return makeResult('Error: query is required for suggest_songs', true);
      }

      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const seedSearch = await spotifyRequest<{ tracks?: { items?: unknown[] } }>(
        tokenResult.token,
        `/search?type=track&limit=5&q=${encodeURIComponent(params.query.trim())}`,
      );
      if (!seedSearch.ok) return makeResult(`Error: ${seedSearch.message}`, true);

      const seeds = (seedSearch.data.tracks?.items ?? [])
        .map(mapTrack)
        .filter((item): item is SpotifyTrack => Boolean(item))
        .slice(0, 5);

      if (!seeds.length) {
        return makeResult(`Could not find seed tracks for "${params.query}".`, true);
      }

      const limit = clampLimit(params.limit, 15);
      const seedIds = seeds.map((track) => track.id).join(',');
      const response = await spotifyRequest<{ tracks?: unknown[] }>(
        tokenResult.token,
        `/recommendations?limit=${limit}&seed_tracks=${seedIds}`,
      );
      if (!response.ok) return makeResult(`Error: ${response.message}`, true);

      const recommendations = (response.data.tracks ?? [])
        .map(mapTrack)
        .filter((item): item is SpotifyTrack => Boolean(item));

      state.lastRecommendations = recommendations;
      state.updatedAt = nowISO();
      await writeState(statePath, state);

      if (!recommendations.length) return makeResult('No recommendations found.');

      const text = recommendations
        .map(
          (track, index) =>
            `${index + 1}. ${track.name} — ${track.artists.join(', ')} (${track.uri})`,
        )
        .join('\n');

      return makeResult(`Suggestions for "${params.query}":\n${text}`);
    }

    case 'create_playlist': {
      const name = params.playlistName?.trim();
      if (!name) return makeResult('Error: playlistName is required for create_playlist', true);

      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const me = await spotifyRequest<{ id: string }>(tokenResult.token, '/me');
      if (!me.ok) return makeResult(`Error: ${me.message}`, true);

      const createResponse = await spotifyRequest<unknown>(
        tokenResult.token,
        `/users/${encodeURIComponent(me.data.id)}/playlists`,
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: params.playlistDescription?.trim() ?? 'Created by Sero Agent',
            public: params.makePublic ?? false,
          }),
        },
      );

      if (!createResponse.ok) return makeResult(`Error: ${createResponse.message}`, true);

      const createdPlaylist = mapPlaylist(createResponse.data);
      if (!createdPlaylist) {
        return makeResult('Error: Spotify returned an invalid playlist payload', true);
      }

      let addedCount = 0;
      const uris = (params.trackUris ?? [])
        .filter((uri) => uri.startsWith('spotify:track:'))
        .slice(0, 100);
      if (uris.length > 0) {
        const addResponse = await spotifyRequest<unknown>(
          tokenResult.token,
          `/playlists/${encodeURIComponent(createdPlaylist.id)}/tracks`,
          {
            method: 'POST',
            body: JSON.stringify({ uris }),
          },
        );
        if (!addResponse.ok) return makeResult(`Error: ${addResponse.message}`, true);
        addedCount = uris.length;
      }

      state.playlists = [
        createdPlaylist,
        ...state.playlists.filter((playlist) => playlist.id !== createdPlaylist.id),
      ];
      state.selectedPlaylistId = createdPlaylist.id;
      state.updatedAt = nowISO();
      await writeState(statePath, state);

      return makeResult(
        `Created playlist "${createdPlaylist.name}" (${createdPlaylist.id}).${
          addedCount > 0 ? ` Added ${addedCount} tracks.` : ''
        }`,
      );
    }

    case 'add_tracks': {
      if (!params.playlistId?.trim()) {
        return makeResult('Error: playlistId is required for add_tracks', true);
      }

      const uris = (params.trackUris ?? [])
        .map((uri) => uri.trim())
        .filter((uri) => uri.startsWith('spotify:track:'))
        .slice(0, 100);

      if (uris.length === 0) {
        return makeResult('Error: trackUris must contain at least one spotify:track URI', true);
      }

      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const response = await spotifyRequest<{ snapshot_id?: string }>(
        tokenResult.token,
        `/playlists/${encodeURIComponent(params.playlistId.trim())}/tracks`,
        {
          method: 'POST',
          body: JSON.stringify({ uris }),
        },
      );

      if (!response.ok) return makeResult(`Error: ${response.message}`, true);

      return makeResult(
        `Added ${uris.length} tracks to playlist ${params.playlistId.trim()}${
          response.data.snapshot_id ? ` (snapshot ${response.data.snapshot_id})` : ''
        }.`,
      );
    }

    case 'start_playlist': {
      if (!params.playlistId?.trim()) {
        return makeResult('Error: playlistId is required for start_playlist', true);
      }

      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const chosenDevice = params.deviceId?.trim() || state.playback.deviceId;
      const query = chosenDevice ? `?device_id=${encodeURIComponent(chosenDevice)}` : '';
      const response = await spotifyRequest<unknown>(
        tokenResult.token,
        `/me/player/play${query}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            context_uri: `spotify:playlist:${params.playlistId.trim()}`,
          }),
        },
      );

      if (!response.ok) return makeResult(`Error: ${response.message}`, true);

      state.selectedPlaylistId = params.playlistId.trim();
      state.playback.isPaused = false;
      if (chosenDevice) {
        state.playback.deviceId = chosenDevice;
      }
      state.playback.updatedAt = nowISO();
      state.updatedAt = nowISO();
      await writeState(statePath, state);

      return makeResult(
        `Started playlist ${params.playlistId.trim()}${
          chosenDevice ? ` on device ${chosenDevice}` : ''
        }.`,
      );
    }

    case 'pause_playback': {
      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const chosenDevice = params.deviceId?.trim() || state.playback.deviceId;
      const query = chosenDevice ? `?device_id=${encodeURIComponent(chosenDevice)}` : '';
      const response = await spotifyRequest<unknown>(
        tokenResult.token,
        `/me/player/pause${query}`,
        {
          method: 'PUT',
        },
      );

      if (!response.ok) return makeResult(`Error: ${response.message}`, true);

      state.playback.isPaused = true;
      state.playback.updatedAt = nowISO();
      state.updatedAt = nowISO();
      await writeState(statePath, state);

      return makeResult('Paused playback.');
    }

    case 'next_track': {
      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const response = await spotifyRequest<unknown>(tokenResult.token, '/me/player/next', {
        method: 'POST',
      });
      if (!response.ok) return makeResult(`Error: ${response.message}`, true);
      return makeResult('Skipped to next track.');
    }

    case 'previous_track': {
      const tokenResult = await withToken();
      if (!tokenResult.ok) return tokenResult.result;

      const response = await spotifyRequest<unknown>(
        tokenResult.token,
        '/me/player/previous',
        {
          method: 'POST',
        },
      );
      if (!response.ok) return makeResult(`Error: ${response.message}`, true);
      return makeResult('Went to previous track.');
    }

    default:
      return makeResult(`Error: unknown action ${params.action}`, true);
  }
}

export function makeErrorResult(text: string): ToolResult {
  return makeResult(`Error: ${text}`, true);
}
