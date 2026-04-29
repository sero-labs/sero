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
  availableFiles: Set<string>;
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

function collectFiles(rootDir: string): Set<string> {
  const files = new Set<string>();
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      files.add(relativePath);
    }
  }

  return files;
}

function buildCache(gatewayDir: string): StaticFileCacheEntry | null {
  const webDistDir = resolveWebDistDir(gatewayDir);
  if (!webDistDir) return null;

  return {
    webDistDir,
    availableFiles: collectFiles(webDistDir),
  };
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

function resolveAssetPath(requestPath: string, availableFiles: Set<string>): string | null {
  if (availableFiles.has(requestPath)) {
    return requestPath;
  }

  const ext = path.posix.extname(requestPath);
  if (!ext || ext === '.html') {
    return availableFiles.has('index.html') ? 'index.html' : null;
  }

  return null;
}

/** Prime static-file metadata once at startup so request paths stay non-blocking. */
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

  const assetPath = resolveAssetPath(requestPath, cache.availableFiles);
  if (!assetPath) return false;

  const filePath = path.join(cache.webDistDir, assetPath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  // Stream the file asynchronously to avoid blocking the event loop
  res.writeHead(200, { 'Content-Type': contentType });
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
