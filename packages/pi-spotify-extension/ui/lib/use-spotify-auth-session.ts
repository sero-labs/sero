import { useCallback, useEffect, useRef, useState } from 'react';

import type { SpotifyAppState } from '../../shared/types';
import {
  buildAuthRequest,
  defaultRedirectUri,
  exchangeCodeForToken,
  isTokenStale,
  refreshAccessToken,
} from './auth';

const AUTH_MESSAGE_TYPE = 'sero-spotify-auth';
export const REMOTE_ORIGIN = new URL(import.meta.url).origin;

interface PendingAuth {
  state: string;
  verifier: string;
}

type UpdateSpotifyState = (
  updater: (prev: SpotifyAppState) => SpotifyAppState,
) => void;

function nowISO(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected Spotify error';
}

const log = (tag: string, ...args: unknown[]) =>
  console.log(`[spotify-auth][${tag}] t=${Date.now() % 100000}`, ...args);

export function useSpotifyAuthSession(args: {
  state: SpotifyAppState;
  updateState: UpdateSpotifyState;
}) {
  const { state, updateState } = args;

  const [clientIdDraft, setClientIdDraft] = useState(state.auth.clientId);
  const [redirectUriDraft, setRedirectUriDraft] = useState(
    state.auth.redirectUri || defaultRedirectUri(REMOTE_ORIGIN),
  );
  const [connecting, setConnecting] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const pendingAuthRef = useRef<PendingAuth | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    if (state.auth.clientId && state.auth.clientId !== clientIdDraft) {
      setClientIdDraft(state.auth.clientId);
    }
  }, [clientIdDraft, state.auth.clientId]);

  useEffect(() => {
    const fallbackRedirect = defaultRedirectUri(REMOTE_ORIGIN);
    const persistedRedirect = state.auth.redirectUri || fallbackRedirect;
    if (persistedRedirect !== redirectUriDraft) {
      setRedirectUriDraft(persistedRedirect);
    }
  }, [redirectUriDraft, state.auth.redirectUri]);

  const commitAuthConfig = useCallback(
    (clientId: string, redirectUri: string) => {
      const cleanClientId = clientId.trim();
      const cleanRedirectUri = redirectUri.trim();

      updateState((prev) => {
        if (prev.auth.clientId === cleanClientId && prev.auth.redirectUri === cleanRedirectUri) {
          return prev;
        }

        return {
          ...prev,
          auth: {
            ...prev.auth,
            clientId: cleanClientId,
            redirectUri: cleanRedirectUri,
          },
          updatedAt: nowISO(),
        };
      });
    },
    [updateState],
  );

  const getValidAccessToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      const clientId = state.auth.clientId.trim();
      const currentAccessToken = state.auth.accessToken;
      const refreshToken = state.auth.refreshToken;

      log('getToken', `force=${forceRefresh} hasToken=${Boolean(currentAccessToken)} stale=${isTokenStale(state.auth.expiresAt)} hasRefresh=${Boolean(refreshToken)}`);

      if (!forceRefresh && currentAccessToken && !isTokenStale(state.auth.expiresAt)) {
        log('getToken', 'returning cached token');
        return currentAccessToken;
      }

      if (!clientId || !refreshToken) {
        log('getToken', 'no clientId or refreshToken — returning current');
        return currentAccessToken;
      }

      if (refreshPromiseRef.current) {
        log('getToken', 'refresh already in flight — waiting');
        return refreshPromiseRef.current;
      }

      log('getToken', 'starting token refresh');
      refreshPromiseRef.current = (async () => {
        try {
          const refreshed = await refreshAccessToken({ clientId, refreshToken });
          log('getToken', 'refresh SUCCESS');
          updateState((prev) => ({
            ...prev,
            auth: {
              ...prev.auth,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? prev.auth.refreshToken,
              expiresAt: refreshed.expiresAt,
              scope: refreshed.scope || prev.auth.scope,
            },
            lastError: null,
            updatedAt: nowISO(),
          }));
          setUiError(null);
          return refreshed.accessToken;
        } catch (error) {
          const message = errorMessage(error);
          setUiError(message);
          updateState((prev) => ({
            ...prev,
            lastError: message,
            updatedAt: nowISO(),
          }));
          return null;
        } finally {
          refreshPromiseRef.current = null;
        }
      })();

      return refreshPromiseRef.current;
    },
    [state.auth.accessToken, state.auth.clientId, state.auth.expiresAt, state.auth.refreshToken, updateState],
  );

  const connectSpotify = useCallback(async () => {
    const clientId = clientIdDraft.trim();
    const redirectUri = redirectUriDraft.trim();

    if (!clientId || !redirectUri) {
      setUiError('Client ID and Redirect URI are required.');
      return;
    }

    setConnecting(true);
    setUiError(null);
    commitAuthConfig(clientId, redirectUri);

    const width = 520;
    const height = 760;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      'about:blank',
      'sero-spotify-auth',
      `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      setConnecting(false);
      setUiError('The auth popup was blocked. Allow popups and retry.');
      return;
    }

    try {
      const request = await buildAuthRequest(clientId, redirectUri);
      pendingAuthRef.current = { state: request.state, verifier: request.verifier };
      popup.location.href = request.authUrl;
      popup.focus();
    } catch (error) {
      popup.close();
      setUiError(errorMessage(error));
      setConnecting(false);
    }
  }, [clientIdDraft, commitAuthConfig, redirectUriDraft]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;

      const payload = event.data as {
        type?: string;
        code?: string | null;
        state?: string | null;
        error?: string | null;
        errorDescription?: string | null;
      };

      if (payload.type !== AUTH_MESSAGE_TYPE) return;

      const redirectOrigin = new URL(redirectUriDraft || defaultRedirectUri(REMOTE_ORIGIN)).origin;
      if (event.origin !== redirectOrigin) return;

      const pending = pendingAuthRef.current;
      if (!pending) return;

      if (payload.error) {
        setConnecting(false);
        setUiError(payload.errorDescription || payload.error || 'Spotify auth was cancelled.');
        pendingAuthRef.current = null;
        return;
      }

      if (!payload.code || payload.state !== pending.state) {
        setConnecting(false);
        setUiError('Spotify auth callback validation failed.');
        pendingAuthRef.current = null;
        return;
      }

      try {
        const clientId = clientIdDraft.trim();
        const redirectUri = redirectUriDraft.trim();
        const tokens = await exchangeCodeForToken({
          clientId,
          redirectUri,
          code: payload.code,
          verifier: pending.verifier,
        });

        updateState((prev) => ({
          ...prev,
          auth: {
            ...prev.auth,
            clientId,
            redirectUri,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken ?? prev.auth.refreshToken,
            expiresAt: tokens.expiresAt,
            scope: tokens.scope,
            connectedAt: nowISO(),
          },
          lastError: null,
          updatedAt: nowISO(),
        }));

        pendingAuthRef.current = null;
        setUiError(null);
      } catch (error) {
        setUiError(errorMessage(error));
      } finally {
        setConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clientIdDraft, redirectUriDraft, updateState]);

  useEffect(() => {
    log('effect:autoRefresh', `hasRefresh=${Boolean(state.auth.refreshToken)} stale=${isTokenStale(state.auth.expiresAt)}`);
    if (!state.auth.refreshToken || !state.auth.clientId) return;
    if (!isTokenStale(state.auth.expiresAt)) return;
    log('effect:autoRefresh', 'token stale — refreshing');
    void getValidAccessToken(true);
  }, [getValidAccessToken, state.auth.clientId, state.auth.expiresAt, state.auth.refreshToken]);

  return {
    connected: Boolean(state.auth.accessToken || state.auth.refreshToken),
    remoteOrigin: REMOTE_ORIGIN,
    clientIdDraft,
    setClientIdDraft,
    redirectUriDraft,
    setRedirectUriDraft,
    connecting,
    uiError,
    setUiError,
    connectSpotify,
    getValidAccessToken,
  };
}
