/**
 * Content Security Policy configuration for the renderer process.
 *
 * Sets a strict CSP via session.webRequest.onHeadersReceived so every
 * renderer response gets a Content-Security-Policy header. This silences
 * Electron's "Insecure Content-Security-Policy" warning and limits what
 * the renderer can load.
 *
 * Sources that must be allowed:
 * - Dev: localhost (Vite dev server + module federation remotes), ws: (HMR)
 * - Prod: sero-ext: (custom protocol for federated extension assets)
 * - Both: https://sdk.scdn.co (Spotify Web Playback SDK script),
 *   https://*.scdn.co + https://*.spotify.com (Spotify API/CDN),
 *   blob: (Vite/MF dynamic imports), data: (inline images),
 *   'unsafe-inline' for styles (Tailwind + inline style attrs)
 */

import { session } from 'electron';

const isDev = process.env.NODE_ENV === 'development';

/** Build the CSP directive string for the current environment. */
function buildCSP(): string {
  // -- script-src --
  // Dev needs 'unsafe-inline' for Vite's injected HMR client script and
  // the inline <script> in index.html (theme flash prevention).
  // 'wasm-unsafe-eval' is required for Shiki's Oniguruma WASM engine
  // (syntax highlighting in the editor). This is narrower than 'unsafe-eval'
  // — it only allows WebAssembly compilation, not arbitrary JS eval().
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    'blob:',
    'https://sdk.scdn.co',          // Spotify Web Playback SDK
    'https://cdn.jsdelivr.net',     // Monaco Editor CDN
    ...(isDev
      ? ['http://localhost:*']      // Vite dev + MF remotes
      : ['sero-ext:']),             // Federated extension assets
  ];

  // -- connect-src --
  const connectSrc = [
    "'self'",
    'https://*.spotify.com',   // Spotify Web API
    'https://*.scdn.co',       // Spotify CDN
    'https://api.spotify.com',
    ...(isDev
      ? ['http://localhost:*', 'ws://localhost:*']  // Vite HMR + dev servers
      : ['sero-ext:']),
  ];

  // -- style-src --
  // 'unsafe-inline' is required for Tailwind's runtime styles and any
  // inline style= attributes used in components.
  const styleSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ['http://localhost:*'] : ['sero-ext:'])];

  // -- img-src --
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://*.scdn.co',       // Spotify album art
    'https://*.spotifycdn.com',
    'https://models.dev',      // AI model provider logos
    ...(isDev ? ['http://localhost:*'] : ['sero-ext:']),
  ];

  // -- font-src --
  const fontSrc = ["'self'", 'data:', ...(isDev ? ['http://localhost:*'] : ['sero-ext:'])];

  // -- media-src (Spotify playback) --
  const mediaSrc = ["'self'", 'blob:', 'https://*.spotify.com', 'https://*.scdn.co'];

  // -- worker-src --
  const workerSrc = ["'self'", 'blob:'];

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src ${fontSrc.join(' ')}`,
    `media-src ${mediaSrc.join(' ')}`,
    `worker-src ${workerSrc.join(' ')}`,
    `child-src 'self' blob:`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join('; ');
}

/**
 * Install the CSP header on the default session.
 * Call once after app.whenReady() and before creating windows.
 */
export function setupContentSecurityPolicy(): void {
  const csp = buildCSP();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  console.log('[sero] CSP installed');
}
