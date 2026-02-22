const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
] as const;

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
}

export interface AuthRequest {
  authUrl: string;
  state: string;
  verifier: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

function toBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomString(length = 64): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((value) => alphabet[value % alphabet.length])
    .join('');
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toBase64Url(digest);
}

function parseTokenResponse(payload: unknown): TokenResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid Spotify token response');
  }
  const data = payload as Partial<TokenResponse>;
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    throw new Error('Spotify token response missing required fields');
  }
  return {
    access_token: data.access_token,
    token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
    scope: typeof data.scope === 'string' ? data.scope : '',
    expires_in: data.expires_in,
    refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
  };
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error_description' in payload
      ? String(payload.error_description)
      : 'Spotify token request failed';
    throw new Error(message);
  }

  return parseTokenResponse(payload);
}

export function defaultRedirectUri(remoteOrigin: string): string {
  const url = new URL(remoteOrigin);
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1';
  }
  return `${url.origin.replace(/\/$/, '')}/spotify-auth-callback.html`;
}

export async function buildAuthRequest(
  clientId: string,
  redirectUri: string,
  scope = SPOTIFY_SCOPES.join(' '),
): Promise<AuthRequest> {
  if (!clientId.trim()) throw new Error('Spotify Client ID is required');
  if (!redirectUri.trim()) throw new Error('Redirect URI is required');

  const verifier = randomString(96);
  const state = randomString(24);
  const challenge = await challengeFromVerifier(verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId.trim(),
    scope,
    redirect_uri: redirectUri.trim(),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  return {
    authUrl: `${AUTH_ENDPOINT}?${params.toString()}`,
    state,
    verifier,
  };
}

export async function exchangeCodeForToken(options: {
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<OAuthTokens> {
  const payload = await requestToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: options.clientId.trim(),
      code: options.code,
      redirect_uri: options.redirectUri.trim(),
      code_verifier: options.verifier,
    }),
  );

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
    scope: payload.scope ?? '',
  };
}

export async function refreshAccessToken(options: {
  clientId: string;
  refreshToken: string;
}): Promise<OAuthTokens> {
  const payload = await requestToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: options.clientId.trim(),
      refresh_token: options.refreshToken,
    }),
  );

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? options.refreshToken,
    expiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
    scope: payload.scope ?? '',
  };
}

export function isTokenStale(expiresAt: string | null, skewMs = 60_000): boolean {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return true;
  return expiry - Date.now() <= skewMs;
}
