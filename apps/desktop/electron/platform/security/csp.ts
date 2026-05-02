/**
 * Content Security Policy configuration for the renderer process.
 *
 * Sets a strict CSP via session.webRequest.onHeadersReceived so every
 * renderer response gets a Content-Security-Policy header. This silences
 * Electron's "Insecure Content-Security-Policy" warning and limits what
 * the renderer can load.
 *
 * Sources that must be allowed:
 * - Dev: localhost (Vite dev server + module federation remotes), ws: (HMR),
 *   and sero-ext: for selectively skipped apps loaded from built bundles
 * - Prod: sero-ext: (custom protocol for federated extension assets) plus
 *   tightly scoped loopback HTTP sources for embedded MCP viewers/auth rails
 * - Both: https://sdk.scdn.co (Spotify Web Playback SDK script),
 *   https://*.scdn.co + https://*.spotify.com (Spotify API/CDN),
 *   blob: (Vite/MF dynamic imports), data: (inline images),
 *   'unsafe-inline' for styles (Tailwind + inline style attrs)
 */

import { session } from 'electron';

interface BuildContentSecurityPolicyOptions {
  isDevelopment?: boolean;
}

/** Build the CSP directive string for the current environment. */
const LOOPBACK_HTTP_SRC = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
];

export function buildContentSecurityPolicy(
  options: BuildContentSecurityPolicyOptions = {},
): string {
  const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV === 'development';
  const extensionSrc = ['sero-ext:'];
  const devHttpSrc = isDevelopment ? ['http://localhost:*'] : [];
  const devConnectSrc = isDevelopment ? ['http://localhost:*', 'ws://localhost:*'] : [];
  const prodLoopbackSrc = isDevelopment ? [] : LOOPBACK_HTTP_SRC;

  // -- script-src --
  // Dev keeps 'unsafe-inline' for Vite's injected dev runtime.
  // The theme bootstrap now ships as a same-origin external script so
  // production no longer needs inline script allowances.
  // 'wasm-unsafe-eval' is required for Shiki's Oniguruma WASM engine
  // (syntax highlighting in the editor). This is narrower than 'unsafe-eval'
  // — it only allows WebAssembly compilation, not arbitrary JS eval().
  const scriptSrc = [
    "'self'",
    ...(isDevelopment ? ["'unsafe-inline'"] : []),
    "'wasm-unsafe-eval'",
    'blob:',
    'https://sdk.scdn.co',          // Spotify Web Playback SDK
    'https://cdn.jsdelivr.net',     // Monaco Editor CDN
    ...devHttpSrc,                  // Vite dev + MF remotes
    ...extensionSrc,                // Federated extension assets
  ];

  // -- connect-src --
  // blob: is required so the prompt-input can fetch() blob URLs to convert
  // pasted/dropped images into data URIs before sending to the agent.
  const connectSrc = [
    "'self'",
    'blob:',
    'https://*.spotify.com',   // Spotify Web API
    'wss://*.spotify.com',     // Spotify Web Playback SDK (dealer WebSocket)
    'https://*.scdn.co',       // Spotify CDN
    'https://api.spotify.com',
    ...devConnectSrc,          // Vite HMR + dev servers
    ...prodLoopbackSrc,        // In-plugin loopback viewers/auth rails in production
    ...extensionSrc,           // Federated extension manifests/assets
  ];

  // -- style-src --
  // 'unsafe-inline' is required for Tailwind's runtime styles and any
  // inline style= attributes used in components.
  // fonts.googleapis.com serves the @font-face CSS for Google Fonts.
  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://cdn.jsdelivr.net',
    'https://fonts.googleapis.com',
    ...devHttpSrc,
    ...extensionSrc,
  ];

  // -- img-src --
  // Browser tabs mirror remote favicons into React chrome, so images need
  // broad HTTPS access even though script/connect stay tightly scoped.
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https:',
    ...devHttpSrc,
    ...extensionSrc,
  ];

  // -- font-src --
  // fonts.gstatic.com serves the actual font files (.woff2) for Google Fonts.
  const fontSrc = ["'self'", 'data:', 'https://fonts.gstatic.com', ...devHttpSrc, ...extensionSrc];

  // -- media-src (Spotify playback) --
  const mediaSrc = ["'self'", 'blob:', 'https://*.spotify.com', 'https://*.scdn.co'];

  // -- worker-src --
  const workerSrc = ["'self'", 'blob:'];

  // -- frame-src --
  // Dev server previews load arbitrary http(s) URLs inside a sandboxed iframe
  // in the editor, so the renderer must explicitly allow framed http(s)
  // content in addition to blob:-backed HTML previews.
  const frameSrc = [
    "'self'",
    'blob:',
    ...(isDevelopment ? ['http:', 'https:'] : prodLoopbackSrc),
    ...extensionSrc,
  ];

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src ${fontSrc.join(' ')}`,
    `media-src ${mediaSrc.join(' ')}`,
    `worker-src ${workerSrc.join(' ')}`,
    `child-src ${frameSrc.join(' ')}`,
    `frame-src ${frameSrc.join(' ')}`,
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join('; ');
}

/**
 * Install the CSP header on the default session.
 * Call once after app.whenReady() and before creating windows.
 */
export function setupContentSecurityPolicy(): void {
  const csp = buildContentSecurityPolicy();

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
