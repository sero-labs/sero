import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpotifyTrack } from '../../shared/types';

interface SpotifySdkPlayerOptions {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyWebPlaybackTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit?: boolean;
  album?: {
    name?: string;
    images?: Array<{ url: string }>;
  };
  artists?: Array<{ name: string }>;
}

interface SpotifyWebPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window?: {
    current_track?: SpotifyWebPlaybackTrack;
  };
}

interface SpotifyPlayerDevice {
  device_id: string;
}

interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (payload: unknown) => void) => void;
  removeListener: (event: string, callback?: (payload: unknown) => void) => void;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
}

interface SpotifyConstructor {
  Player: new (options: SpotifySdkPlayerOptions) => SpotifyPlayerInstance;
}

declare global {
  interface Window {
    Spotify?: SpotifyConstructor;
    onSpotifyWebPlaybackSDKReady?: () => void;
    define?: unknown;
  }
}

export interface WebPlaybackSnapshot {
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  track: SpotifyTrack | null;
}

export interface SpotifyPlayerHookResult {
  ready: boolean;
  deviceId: string | null;
  error: string | null;
  playback: WebPlaybackSnapshot;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
}

const initialPlayback: WebPlaybackSnapshot = {
  isPaused: true,
  positionMs: 0,
  durationMs: 0,
  track: null,
};

let sdkPromise: Promise<void> | null = null;
let emeSupported: boolean | null = null;

function clearSdkPromiseOnFailure(): void {
  sdkPromise = null;
}

/**
 * Probe whether Encrypted Media Extensions (Widevine) is available.
 * The Spotify Web Playback SDK requires EME for DRM audio. If it's missing
 * (e.g. stock Electron without Widevine CDM), we skip the SDK entirely to
 * avoid wasting API rate-limit budget on calls that will always fail.
 */
async function checkEmeSupport(): Promise<boolean> {
  if (emeSupported !== null) return emeSupported;

  if (typeof navigator.requestMediaKeySystemAccess !== 'function') {
    console.warn('[spotify-player] EME API not available — skipping Web Playback SDK');
    emeSupported = false;
    return false;
  }

  try {
    await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
      {
        initDataTypes: ['cenc'],
        audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' }],
      },
    ]);
    emeSupported = true;
    return true;
  } catch {
    console.warn('[spotify-player] Widevine CDM not available — skipping Web Playback SDK');
    emeSupported = false;
    return false;
  }
}

function mapSdkTrack(track: SpotifyWebPlaybackTrack | undefined): SpotifyTrack | null {
  if (!track || !track.id || !track.uri || !track.name) return null;

  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: (track.artists ?? [])
      .map((artist) => artist.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
    albumName: track.album?.name ?? 'Unknown album',
    albumArtUrl: track.album?.images?.[0]?.url ?? null,
    durationMs: track.duration_ms ?? 0,
    explicit: Boolean(track.explicit),
    previewUrl: null,
  };
}

async function loadSpotifySdk(): Promise<void> {
  if (window.Spotify?.Player) return;
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-sero-spotify-sdk="true"]',
    );
    const previousReadyHandler = window.onSpotifyWebPlaybackSDKReady;
    const previousDefine = window.define;
    let settled = false;
    let timeoutId = 0;

    // Spotify's SDK bundles tslib in a UMD wrapper that breaks if an AMD
    // loader is present (define.amd). Hide it during script evaluation.
    const restoreDefine = () => {
      if (previousDefine === undefined) {
        delete window.define;
        return;
      }
      window.define = previousDefine;
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      restoreDefine();
      window.onSpotifyWebPlaybackSDKReady = previousReadyHandler;
      fn();
    };

    const fail = (message: string) => {
      finish(() => {
        clearSdkPromiseOnFailure();
        reject(new Error(message));
      });
    };

    const succeed = () => {
      finish(() => {
        resolve();
      });
    };

    const existingIsBroken = existingScript && !window.Spotify?.Player;
    if (existingIsBroken) {
      existingScript.remove();
    }

    const script = existingIsBroken
      ? null
      : existingScript;
    const targetScript = script ?? document.createElement('script');

    const validateReady = () => {
      if (window.Spotify?.Player) {
        succeed();
        return;
      }
      fail(
        'Spotify Web Playback SDK failed to initialize (likely AMD/tslib conflict).',
      );
    };

    window.onSpotifyWebPlaybackSDKReady = () => {
      try {
        previousReadyHandler?.();
      } catch {
        // Ignore host callback errors; our validation still runs.
      }
      validateReady();
    };

    targetScript.addEventListener('load', () => {
      // If the SDK script executes successfully it should synchronously set
      // window.Spotify and call the ready callback. If not, reject instead of
      // hanging forever.
      window.setTimeout(validateReady, 0);
    }, { once: true });
    targetScript.addEventListener('error', () => {
      fail('Failed to load Spotify Web Playback SDK script.');
    }, { once: true });

    timeoutId = window.setTimeout(() => {
      fail('Timed out while loading Spotify Web Playback SDK.');
    }, 10000);

    if (script) {
      return;
    }

    window.define = undefined;
    targetScript.src = 'https://sdk.scdn.co/spotify-player.js';
    targetScript.async = true;
    targetScript.dataset.seroSpotifySdk = 'true';
    targetScript.crossOrigin = 'anonymous';
    document.body.appendChild(targetScript);
  });

  return sdkPromise;
}

export function useSpotifyPlayer(options: {
  accessToken: string | null;
  playerName: string;
  volume?: number;
  onDeviceReady?: (deviceId: string) => void;
}): SpotifyPlayerHookResult {
  const { accessToken, playerName, volume = 0.75, onDeviceReady } = options;
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<WebPlaybackSnapshot>(initialPlayback);

  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const onDeviceReadyRef = useRef(onDeviceReady);

  useEffect(() => {
    onDeviceReadyRef.current = onDeviceReady;
  }, [onDeviceReady]);

  useEffect(() => {
    let disposed = false;

    const connectPlayer = async () => {
      if (!accessToken) {
        setReady(false);
        setDeviceId(null);
        setPlayback(initialPlayback);
        playerRef.current?.disconnect();
        playerRef.current = null;
        return;
      }

      setError(null);

      try {
        const hasEme = await checkEmeSupport();
        if (disposed) return;
        if (!hasEme) {
          setError('Widevine CDM not available — Web Playback SDK disabled');
          setReady(false);
          return;
        }

        await loadSpotifySdk();
        if (disposed) return;
        if (!window.Spotify?.Player) {
          throw new Error('Spotify Web Playback SDK failed to initialize');
        }

        const player = new window.Spotify.Player({
          name: playerName,
          volume,
          getOAuthToken: (callback) => callback(accessToken),
        });

        playerRef.current = player;

        const handleReady = (payload: unknown) => {
          const device = payload as SpotifyPlayerDevice;
          if (!device?.device_id) return;
          setDeviceId(device.device_id);
          setReady(true);
          onDeviceReadyRef.current?.(device.device_id);
        };

        const handleNotReady = () => {
          setReady(false);
        };

        const handleStateChange = (payload: unknown) => {
          const state = payload as SpotifyWebPlaybackState | null;
          if (!state) return;

          setPlayback({
            isPaused: state.paused,
            positionMs: state.position ?? 0,
            durationMs: state.duration ?? 0,
            track: mapSdkTrack(state.track_window?.current_track),
          });
        };

        const handleAuthError = (payload: unknown) => {
          const message = typeof payload === 'object' && payload && 'message' in payload
            ? String((payload as { message: unknown }).message)
            : 'Spotify authentication failed';
          setError(message);
        };

        player.addListener('ready', handleReady);
        player.addListener('not_ready', handleNotReady);
        player.addListener('player_state_changed', handleStateChange);
        player.addListener('initialization_error', handleAuthError);
        player.addListener('authentication_error', handleAuthError);
        player.addListener('account_error', handleAuthError);

        const connected = await player.connect();
        if (!connected) {
          throw new Error('Could not connect Spotify player');
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Unknown Spotify SDK error');
          setReady(false);
        }
      }
    };

    void connectPlayer();

    return () => {
      disposed = true;
      setReady(false);
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [accessToken, playerName, volume]);

  const togglePlay = useCallback(async () => {
    if (!playerRef.current) return;
    await playerRef.current.togglePlay();
  }, []);

  const next = useCallback(async () => {
    if (!playerRef.current) return;
    await playerRef.current.nextTrack();
  }, []);

  const previous = useCallback(async () => {
    if (!playerRef.current) return;
    await playerRef.current.previousTrack();
  }, []);

  const setVolume = useCallback(async (value: number) => {
    if (!playerRef.current) return;
    const clamped = Math.max(0, Math.min(1, value));
    await playerRef.current.setVolume(clamped);
  }, []);

  return useMemo(
    () => ({
      ready,
      deviceId,
      error,
      playback,
      togglePlay,
      next,
      previous,
      setVolume,
    }),
    [deviceId, error, next, playback, previous, ready, setVolume, togglePlay],
  );
}
