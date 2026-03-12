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

/**
 * Resolve the web-dist directory. After esbuild bundling, __dirname is
 * dist/electron/ — check there first (copied by build-electron.mjs),
 * then fall back to the source location (electron/gateway/web-dist/).
 */
function resolveWebDistDir(gatewayDir: string): string | null {
  // Primary: web-dist/ next to the bundled output (dist/electron/web-dist/)
  const bundled = path.join(gatewayDir, 'web-dist');
  if (fs.existsSync(bundled)) return bundled;

  // Fallback: source location (electron/gateway/web-dist/ relative to project root)
  // From dist/electron/ → ../../electron/gateway/web-dist/
  const source = path.join(gatewayDir, '..', '..', 'electron', 'gateway', 'web-dist');
  if (fs.existsSync(source)) return source;

  return null;
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
  const webDistDir = resolveWebDistDir(gatewayDir);

  // Check if web-dist exists
  if (!webDistDir) return false;

  // Map pathname to file
  let filePath = path.join(webDistDir, pathname === '/' ? 'index.html' : pathname);

  // Prevent path traversal
  if (!filePath.startsWith(webDistDir)) {
    return false;
  }

  // Try exact file first
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback: serve index.html for non-asset paths
    const ext = path.extname(pathname);
    if (!ext || ext === '.html') {
      filePath = path.join(webDistDir, 'index.html');
    } else {
      return false;
    }
  }

  if (!fs.existsSync(filePath)) return false;

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
  const content = fs.readFileSync(filePath);

  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
  return true;
}
