/**
 * Plugin asset route — `/ext/<app-id>/<file>`.
 *
 * The desktop serves the same files over the privileged `sero-ext://`
 * protocol. This mirrors it for the browser, with the same traversal and
 * symlink guards, and a signed ticket in place of the desktop's implicit
 * trust.
 *
 * Only apps registered here are served, and only files inside their own
 * `dist/ui` directory.
 */

import http from 'http';
import path from 'path';
import { realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import type { AssetTicketManager } from '../security/asset-ticket';

/** Every asset URL starts with this. */
export const EXT_ASSET_PREFIX = '/ext/';

/** Served when the URL names a directory rather than a file. */
const DEFAULT_ASSET = 'mf-manifest.json';

/** Apps whose assets may be served, keyed by app id. */
const servable = new Map<string, string>();

/** Allow `appId`'s assets to be served from `packagePath`. */
export function registerRemoteAssets(appId: string, packagePath: string): void {
  servable.set(appId, packagePath);
}

/** Stop serving an app's assets. */
export function unregisterRemoteAssets(appId: string): void {
  servable.delete(appId);
}

/** True when this app has assets the gateway can serve. */
export function hasRemoteAssets(appId: string): boolean {
  return servable.has(appId);
}

/** Test seam. Forgets every registered app. */
export function resetRemoteAssets(): void {
  servable.clear();
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
}

/** The URL a client fetches this app's federation manifest from. */
export function manifestUrl(appId: string, ticket: string): string {
  return `${assetBase(appId, ticket)}${DEFAULT_ASSET}`;
}

/** Where an app's files live for one ticket. Always ends in a slash. */
function assetBase(appId: string, ticket: string): string {
  return `${EXT_ASSET_PREFIX}${encodeURIComponent(ticket)}/${encodeURIComponent(appId)}/`;
}

/**
 * Point the federation manifest at the gateway.
 *
 * The ticket sits in the path, not in a query parameter, because a built
 * plugin bundle works out its own base URL from the directory its script
 * came from. A query parameter is dropped there; a path prefix is kept,
 * so every chunk it fetches later stays ticketed.
 */
export function rewriteFederationManifest(
  raw: string,
  appId: string,
  ticket: string,
): string {
  try {
    const manifest = JSON.parse(raw) as { metaData?: Record<string, unknown> };
    if (manifest.metaData && typeof manifest.metaData === 'object') {
      manifest.metaData.publicPath = assetBase(appId, ticket);
    }
    return JSON.stringify(manifest);
  } catch {
    // An unparseable manifest is the plugin's problem, not ours. Serving
    // it unchanged fails loudly in the client rather than silently here.
    return raw;
  }
}

interface ParsedAssetUrl {
  appId: string;
  filePath: string;
  ticket: string;
}

/**
 * Split an asset URL into its parts: `/ext/<ticket>/<app-id>/<file>`.
 *
 * A missing file means the federation manifest, which is what a client
 * asks for first.
 */
export function parseAssetUrl(rawUrl: string): ParsedAssetUrl | null {
  const [rawPath] = rawUrl.split('?');
  if (!rawPath.startsWith(EXT_ASSET_PREFIX)) return null;

  const rest = rawPath.slice(EXT_ASSET_PREFIX.length);
  const firstSlash = rest.indexOf('/');
  if (firstSlash <= 0) return null;

  const ticket = decodeURIComponent(rest.slice(0, firstSlash));
  const afterTicket = rest.slice(firstSlash + 1);
  const secondSlash = afterTicket.indexOf('/');
  const appId = decodeURIComponent(
    secondSlash === -1 ? afterTicket : afterTicket.slice(0, secondSlash),
  );
  if (!appId) return null;

  const filePath = secondSlash === -1
    ? DEFAULT_ASSET
    : decodeURIComponent(afterTicket.slice(secondSlash + 1)) || DEFAULT_ASSET;

  return { appId, filePath, ticket };
}

/**
 * Resolve an asset to a real file inside the app's `dist/ui`.
 * Returns null when the path escapes, by traversal or by symlink.
 */
export function resolveAssetPath(packagePath: string, filePath: string): string | null {
  if (filePath.includes('\0')) return null;

  const distDir = path.resolve(packagePath, 'dist', 'ui');
  const fullPath = path.resolve(distDir, filePath);
  if (!fullPath.startsWith(distDir + path.sep) && fullPath !== distDir) return null;

  // A symlink inside dist/ui could still point outside it.
  try {
    const realPath = realpathSync(fullPath);
    const realDist = realpathSync(distDir);
    if (!realPath.startsWith(realDist + path.sep) && realPath !== realDist) return null;
  } catch {
    // Missing file. The read below answers 404.
  }

  return fullPath;
}

/**
 * Serve a plugin asset. Returns false when the URL is not an asset URL,
 * so the caller can carry on to its other routes.
 */
export async function tryServeExtAsset(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  tickets: AssetTicketManager,
): Promise<boolean> {
  const parsed = parseAssetUrl(req.url ?? '/');
  if (!parsed) return false;

  const payload = tickets.verify(parsed.ticket);
  // A ticket for another app must not open this one.
  if (!payload || payload.appId !== parsed.appId) {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unauthorized');
    return true;
  }

  const packagePath = servable.get(parsed.appId);
  if (!packagePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unknown app');
    return true;
  }

  const fullPath = resolveAssetPath(packagePath, parsed.filePath);
  if (!fullPath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return true;
  }

  try {
    if (parsed.filePath === DEFAULT_ASSET) {
      const raw = await readFile(fullPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(rewriteFederationManifest(raw, parsed.appId, parsed.ticket));
      return true;
    }

    const body = await readFile(fullPath);
    res.writeHead(200, {
      'Content-Type': contentTypeFor(fullPath),
      // Plugin assets are hashed by the federation build, so they can be
      // cached hard. The manifest above is deliberately not cached.
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
  return true;
}
