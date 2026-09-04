/**
 * Static file server — serves the web-remote SPA from web-dist/.
 *
 * Extracted from gateway/index.ts to keep that file under 500 LOC.
 * Handles MIME type detection, path traversal prevention, and SPA
 * fallback routing (unknown paths → index.html).
 */

import fs from 'fs';
import path from 'path';
import http from 'http';

/** MIME type map for static file serving. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

interface StaticFileCacheEntry {
  webDistDir: string;
}

const staticFileCache = new Map<string, StaticFileCacheEntry | null>();

/**
 * Resolve the web-dist directory. After esbuild bundling, __dirname is
 * dist/electron/ — check there first (copied by build-electron.mjs),
 * then fall back to the source location (electron/features/gateway/web-dist/).
 */
function resolveWebDistDir(gatewayDir: string): string | null {
  // Primary: web-dist/ next to the bundled output (dist/electron/web-dist/)
  const bundled = path.join(gatewayDir, 'web-dist');
  if (fs.existsSync(bundled)) return bundled;

  // Fallback: source location (electron/features/gateway/web-dist/ relative to project root)
  // From dist/electron/ → ../../electron/features/gateway/web-dist/
  const source = path.join(gatewayDir, '..', '..', 'electron', 'features', 'gateway', 'web-dist');
  if (fs.existsSync(source)) return source;

  return null;
}

function buildCache(gatewayDir: string): StaticFileCacheEntry | null {
  const webDistDir = resolveWebDistDir(gatewayDir);
  if (!webDistDir) return null;
  return { webDistDir };
}

function getCache(gatewayDir: string): StaticFileCacheEntry | null {
  if (!staticFileCache.has(gatewayDir)) {
    staticFileCache.set(gatewayDir, buildCache(gatewayDir));
  }
  return staticFileCache.get(gatewayDir) ?? null;
}

function normalizeRequestPath(pathname: string): string | null {
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const strippedPath = decodedPath.replace(/^\/+/, '');
  const normalized = path.posix.normalize(strippedPath || 'index.html');
  if (normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

function resolveAssetPath(requestPath: string, webDistDir: string): string | null {
  const directPath = path.join(webDistDir, requestPath);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return requestPath;
  }

  const ext = path.posix.extname(requestPath);
  const indexPath = path.join(webDistDir, 'index.html');
  if ((!ext || ext === '.html') && fs.existsSync(indexPath)) {
    return 'index.html';
  }

  return null;
}

/**
 * Cache policy. Files under assets/ carry a content hash in their name,
 * so they can be cached forever. Everything else — index.html above all —
 * must be revalidated, or a client keeps an old shell after an update.
 */
function cacheControlFor(assetPath: string): string {
  return assetPath.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/** Prime static-file directory resolution once at startup. Asset paths are checked per request so rebuilt bundles work without restarting Sero. */
export function primeStaticFileCache(gatewayDir: string): void {
  getCache(gatewayDir);
}

/**
 * Attempt to serve a static file from the web-dist/ directory.
 * Returns true if the file was served, false otherwise.
 * For SPA routing, serves index.html for unknown paths.
 *
 * @param gatewayDir - The __dirname of the gateway module (where web-dist/ lives)
 */
export function tryServeStaticFile(
  pathname: string,
  res: http.ServerResponse,
  gatewayDir: string,
): boolean {
  const cache = getCache(gatewayDir);
  if (!cache) return false;

  const requestPath = normalizeRequestPath(pathname);
  if (!requestPath) return false;

  const assetPath = resolveAssetPath(requestPath, cache.webDistDir);
  if (!assetPath) return false;

  const filePath = path.join(cache.webDistDir, assetPath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  // Stream the file asynchronously to avoid blocking the event loop
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControlFor(assetPath),
  });
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end();
  });

  return true;
}
