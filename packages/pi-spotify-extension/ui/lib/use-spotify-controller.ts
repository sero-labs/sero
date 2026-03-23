import { useAppState, useAgentPrompt } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SpotifyAppState } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import {
  SpotifyApiError,
  fetchCurrentPlayback,
  fetchPlaylistTracks,
  fetchPlaylists,
  fetchProfile,
  playPlaylist,
  playTracks,
  recommendTracksFromQuery,
  searchTracks,
  skipNext,
  skipPrevious,
} from './spotify-api';
import { useSpotifyAuthSession } from './use-spotify-auth-session';
import { useSpotifyPlayer } from './use-spotify-player';

function nowISO(): string {
  return new Date().toISOString();
}

function userErrorMessage(error: unknown): string {
  if (error instanceof SpotifyApiError) return error.toUserMessage();
  if (error instanceof Error) return error.message;
  return 'Unexpected Spotify error';
}

let renderCount = 0;
const log = (tag: string, ...args: unknown[]) =>
  console.log(`[spotify-ctrl][${tag}] t=${Date.now() % 100000}`, ...args);

export function useSpotifyController() {
  const render = ++renderCount;
  log('render', `#${render}`);

  const [state, updateState] = useAppState<SpotifyAppState>(DEFAULT_STATE);
  const promptAgent = useAgentPrompt();

  const {
    connected,
    remoteOrigin,
    clientIdDraft,
    setClientIdDraft,
    redirectUriDraft,
    setRedirectUriDraft,
    connecting,
    uiError,
    setUiError,
    connectSpotify,
    getValidAccessToken,
  } = useSpotifyAuthSession({ state, updateState });

  const [searchQuery, setSearchQuery] = useState('cinematic focus electronic');
  const [searchResults, setSearchResults] = useState(state.lastRecommendations);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const autoLoadAttemptedRef = useRef<Set<string>>(new Set());
  const syncInFlightRef = useRef(false);

  // Keep stable refs so the sync effect doesn't re-fire when these change identity.
  const getValidAccessTokenRef = useRef(getValidAccessToken);
  const setUiErrorRef = useRef(setUiError);
  const updateStateRef = useRef(updateState);
  useEffect(() => { getValidAccessTokenRef.current = getValidAccessToken; }, [getValidAccessToken]);
  useEffect(() => { setUiErrorRef.current = setUiError; }, [setUiError]);
  useEffect(() => { updateStateRef.current = updateState; }, [updateState]);

  const syncLibrary = useCallback(
    async (tokenOverride?: string): Promise<void> => {
      if (syncInFlightRef.current) {
        log('syncLibrary', 'SKIPPED — already in flight');
        return;
      }
      syncInFlightRef.current = true;
      log('syncLibrary', 'START', tokenOverride ? '(token override)' : '(fetching token)');

      const token = tokenOverride ?? await getValidAccessTokenRef.current();
      if (!token) {
        log('syncLibrary', 'ABORT — no token');
        syncInFlightRef.current = false;
        return;
      }
      log('syncLibrary', 'token ok, fetching profile…');

      setSyncingLibrary(true);
      try {
        // Serialize requests to stay within development-mode rate limits.
        const profile = await fetchProfile(token);
        log('syncLibrary', 'profile done, fetching playback…');
        const playback = await fetchCurrentPlayback(token);
        log('syncLibrary', 'playback done, fetching playlists…');

        let playlists: Awaited<ReturnType<typeof fetchPlaylists>> | null = null;
        try {
          playlists = await fetchPlaylists(token, 30);
          log('syncLibrary', `playlists done (${playlists.length})`);
        } catch (playlistError) {
          // If playlists are rate-limited, we'll fall back to cached data in the updater.
          log('syncLibrary', `playlists failed (${userErrorMessage(playlistError)}), keeping cached`);
        }

        updateStateRef.current((prev) => {
          const finalPlaylists = playlists ?? prev.playlists;
          const selectedPlaylistId = prev.selectedPlaylistId || finalPlaylists[0]?.id || null;
          return {
            ...prev,
            profile,
            playlists: finalPlaylists,
            selectedPlaylistId,
            playback: {
              ...prev.playback,
              deviceId: playback.deviceId ?? prev.playback.deviceId,
              deviceName: playback.deviceName ?? prev.playback.deviceName,
              isPaused: playback.isPaused,
              progressMs: playback.progressMs,
              volumePercent: playback.volumePercent,
              currentTrack: playback.track ?? prev.playback.currentTrack,
              updatedAt: nowISO(),
            },
            lastError: null,
            updatedAt: nowISO(),
          };
        });
      } catch (error) {
        const message = userErrorMessage(error);
        log('syncLibrary', 'ERROR', message);
        setUiErrorRef.current(message);
        updateStateRef.current((prev) => ({ ...prev, lastError: message, updatedAt: nowISO() }));
      } finally {
        syncInFlightRef.current = false;
        setSyncingLibrary(false);
        log('syncLibrary', 'END');
      }
    },
    [], // stable — uses refs internally
  );

  const loadPlaylistTracks = useCallback(
    async (playlistId: string, force = false): Promise<void> => {
      if (!playlistId) return;
      if (!force && state.tracksByPlaylist[playlistId]) {
        log('loadTracks', `SKIPPED ${playlistId} — cached`);
        return;
      }
      log('loadTracks', `START ${playlistId}`);

      const token = await getValidAccessTokenRef.current();
      if (!token) {
        log('loadTracks', 'ABORT — no token');
        return;
      }

      setLoadingTracks(true);
      try {
        const tracks = await fetchPlaylistTracks(token, playlistId, 100);
        autoLoadAttemptedRef.current.add(playlistId);
        updateStateRef.current((prev) => ({
          ...prev,
          tracksByPlaylist: {
            ...prev.tracksByPlaylist,
            [playlistId]: tracks,
          },
          lastError: null,
          updatedAt: nowISO(),
        }));
      } catch (error) {
        const message = userErrorMessage(error);
        setUiErrorRef.current(message);
        updateStateRef.current((prev) => ({ ...prev, lastError: message, updatedAt: nowISO() }));
      } finally {
        setLoadingTracks(false);
      }
    },
    [state.tracksByPlaylist],
  );

  // Sync once when auth is available, then on a 2-min interval.
  // Does NOT depend on syncLibrary / getValidAccessToken identity to avoid
  // the feedback loop (state update → new callback identity → effect re-fires).
  useEffect(() => {
    log('effect:sync', `accessToken=${Boolean(state.auth.accessToken)} refreshToken=${Boolean(state.auth.refreshToken)}`);
    if (!state.auth.accessToken && !state.auth.refreshToken) return;
    log('effect:sync', 'calling syncLibrary');
    void syncLibrary();

    const intervalId = window.setInterval(() => {
      void syncLibrary();
    }, 120_000);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.auth.accessToken, state.auth.refreshToken]);

  const handleDeviceReady = useCallback(
    (deviceId: string) => {
      updateState((prev) => {
        if (prev.playback.deviceId === deviceId && prev.playback.deviceName === 'Sero Player') {
          return prev;
        }
        return {
          ...prev,
          playback: {
            ...prev.playback,
            deviceId,
            deviceName: 'Sero Player',
            updatedAt: nowISO(),
          },
          updatedAt: nowISO(),
        };
      });
    },
    [updateState],
  );

  const player = useSpotifyPlayer({
    accessToken: state.auth.accessToken,
    playerName: 'Sero Spotify Deck',
    onDeviceReady: handleDeviceReady,
  });

  useEffect(() => {
    const trackId = player.playback.track?.id ?? null;
    const persistedTrackId = state.playback.currentTrack?.id ?? null;

    if (
      trackId === persistedTrackId
      && player.playback.isPaused === state.playback.isPaused
      && (!player.deviceId || player.deviceId === state.playback.deviceId)
    ) {
      return;
    }

    updateState((prev) => ({
      ...prev,
      playback: {
        ...prev.playback,
        deviceId: player.deviceId ?? prev.playback.deviceId,
        deviceName: player.deviceId ? 'Sero Player' : prev.playback.deviceName,
        isPaused: player.playback.isPaused,
        currentTrack: player.playback.track ?? prev.playback.currentTrack,
        updatedAt: nowISO(),
      },
      updatedAt: nowISO(),
    }));
  }, [
    player.deviceId,
    player.playback.isPaused,
    player.playback.track,
    state.playback.currentTrack?.id,
    state.playback.deviceId,
    state.playback.isPaused,
    updateState,
  ]);

  const selectedPlaylist = useMemo(
    () => state.playlists.find((playlist) => playlist.id === state.selectedPlaylistId) ?? null,
    [state.playlists, state.selectedPlaylistId],
  );

  const selectedTracks = state.selectedPlaylistId
    ? state.tracksByPlaylist[state.selectedPlaylistId] ?? []
    : [];

  useEffect(() => {
    const firstPlaylist = state.playlists[0];
    log('effect:autoLoad', `selectedId=${state.selectedPlaylistId} playlists=${state.playlists.length} cached=${state.selectedPlaylistId ? Boolean(state.tracksByPlaylist[state.selectedPlaylistId]) : 'n/a'}`);
    if (!state.selectedPlaylistId && firstPlaylist) {
      log('effect:autoLoad', `selecting first playlist: ${firstPlaylist.id}`);
      updateState((prev) => ({ ...prev, selectedPlaylistId: firstPlaylist.id, updatedAt: nowISO() }));
      return;
    }

    if (
      state.selectedPlaylistId
      && !state.tracksByPlaylist[state.selectedPlaylistId]
      && !autoLoadAttemptedRef.current.has(state.selectedPlaylistId)
    ) {
      log('effect:autoLoad', `loading tracks for ${state.selectedPlaylistId}`);
      autoLoadAttemptedRef.current.add(state.selectedPlaylistId);
      void loadPlaylistTracks(state.selectedPlaylistId);
    }
  }, [loadPlaylistTracks, state.playlists, state.selectedPlaylistId, state.tracksByPlaylist, updateState]);

  const selectPlaylist = useCallback(
    (playlistId: string) => {
      updateState((prev) => ({ ...prev, selectedPlaylistId: playlistId, updatedAt: nowISO() }));
      autoLoadAttemptedRef.current.delete(playlistId);
      void loadPlaylistTracks(playlistId);
    },
    [loadPlaylistTracks, updateState],
  );

  const playSelectedPlaylist = useCallback(async () => {
    if (!selectedPlaylist) return;
    const token = await getValidAccessToken();
    if (!token) return;

    try {
      await playPlaylist(token, selectedPlaylist.id, player.deviceId ?? state.playback.deviceId);
      updateState((prev) => ({
        ...prev,
        selectedPlaylistId: selectedPlaylist.id,
        playback: {
          ...prev.playback,
          isPaused: false,
          updatedAt: nowISO(),
        },
        updatedAt: nowISO(),
      }));
    } catch (error) {
      setUiError(userErrorMessage(error));
    }
  }, [getValidAccessToken, player.deviceId, selectedPlaylist, setUiError, state.playback.deviceId, updateState]);

  const playTrack = useCallback(
    async (uri: string) => {
      const token = await getValidAccessToken();
      if (!token) return;

      try {
        await playTracks(token, [uri], player.deviceId ?? state.playback.deviceId);
      } catch (error) {
        setUiError(userErrorMessage(error));
      }
    },
    [getValidAccessToken, player.deviceId, setUiError, state.playback.deviceId],
  );

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const results = await searchTracks(token, searchQuery.trim(), 12);
      setSearchResults(results);
    } catch (error) {
      setUiError(userErrorMessage(error));
    } finally {
      setSearching(false);
    }
  }, [getValidAccessToken, searchQuery, setUiError]);

  const runSuggest = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSuggesting(true);
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const tracks = await recommendTracksFromQuery(token, searchQuery.trim(), 12);
      updateState((prev) => ({ ...prev, lastRecommendations: tracks, updatedAt: nowISO() }));
      setSearchResults(tracks);
    } catch (error) {
      setUiError(userErrorMessage(error));
    } finally {
      setSuggesting(false);
    }
  }, [getValidAccessToken, searchQuery, setUiError, updateState]);

  const askAgentCreatePlaylist = useCallback(() => {
    const intent = searchQuery.trim() || 'upbeat focus mix';
    promptAgent(
      `Use the spotify tool to make me a fresh playlist for this vibe: "${intent}". `
      + '1) search_tracks for candidate songs, 2) create_playlist with a short description, '
      + '3) add_tracks with the best URIs, then tell me the playlist name and ID.',
    );
  }, [promptAgent, searchQuery]);

  const askAgentSuggestSongs = useCallback(() => {
    const intent = searchQuery.trim() || 'coding flow';
    promptAgent(
      `Use spotify action suggest_songs with query "${intent}" and give me the top 10 suggestions with brief reasons.`,
    );
  }, [promptAgent, searchQuery]);

  const togglePlayback = useCallback(() => {
    void player.togglePlay();
  }, [player]);

  const nextTrack = useCallback(() => {
    void player.next();
    void getValidAccessToken().then((token) => {
      if (token) {
        void skipNext(token);
      }
    });
  }, [getValidAccessToken, player]);

  const previousTrack = useCallback(() => {
    void player.previous();
    void getValidAccessToken().then((token) => {
      if (token) {
        void skipPrevious(token);
      }
    });
  }, [getValidAccessToken, player]);

  const artBackdrop =
    player.playback.track?.albumArtUrl
    ?? selectedPlaylist?.imageUrl
    ?? state.playlists[0]?.imageUrl
    ?? null;

  return {
    connected,
    remoteOrigin,
    state,
    selectedPlaylist,
    selectedTracks,
    artBackdrop,
    clientIdDraft,
    setClientIdDraft,
    redirectUriDraft,
    setRedirectUriDraft,
    searchQuery,
    setSearchQuery,
    searchResults,
    connecting,
    syncingLibrary,
    loadingTracks,
    searching,
    suggesting,
    uiError,
    player,
    connectSpotify,
    syncLibrary,
    selectPlaylist,
    playSelectedPlaylist,
    playTrack,
    runSearch,
    runSuggest,
    askAgentCreatePlaylist,
    askAgentSuggestSongs,
    togglePlayback,
    nextTrack,
    previousTrack,
  };
}
