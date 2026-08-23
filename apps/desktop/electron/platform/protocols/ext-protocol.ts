/**
 * Custom protocol for serving Sero extension UI assets.
 *
 * Registers `sero-ext://` protocol so the renderer can load federated
 * remoteEntry.js and chunks from extension packages on disk.
 *
 * URL format: sero-ext://<app-id>/<file-path>
 * Resolves to: <package-path>/ui/dist/<file-path>
 *
 * Must call registerExtProtocolScheme() BEFORE app.whenReady(),
 * and setupExtProtocol() AFTER app.whenReady().
 */

import { protocol } from 'electron';
import path from 'path';
import { realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import type { SeroAppManifest } from '@/types/ipc';

// ── App registry (populated by discovery) ────────────────────

const appRegistry = new Map<string, SeroAppManifest>();

/** Register a discovered app so its assets can be served. */
export function registerExtAssets(manifest: SeroAppManifest): void {
  if (!manifest.uiEntry) {
    appRegistry.delete(manifest.id);
    return;
  }

  appRegistry.set(manifest.id, manifest);
}

export function unregisterExtAssets(appId: string): void {
  appRegistry.delete(appId);
}

export function hasRegisteredExtAssets(appId: string): boolean {
  return appRegistry.has(appId);
}

/** Register multiple discovered apps. */
export function registerAllExtAssets(manifests: SeroAppManifest[]): void {
  for (const manifest of manifests) {
    registerExtAssets(manifest);
  }
}

function rewriteFederationManifest(raw: string, appId: string): string {
  try {
    const manifest = JSON.parse(raw);
    const publicPath = `sero-ext://${appId}/`;

    if (manifest?.metaData && typeof manifest.metaData === 'object') {
      manifest.metaData.publicPath = publicPath;
    }

    return JSON.stringify(manifest);
  } catch (error) {
    console.warn('[sero] Failed to rewrite federation manifest:', {
      appId,
      error,
    });
    return raw;
  }
}

function getAssetContentType(filePath: string): string {
  switch (path.extname(filePath)) {
    case '.css': return 'text/css; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.json':
    case '.map': return 'application/json; charset=utf-8';
    case '.wasm': return 'application/wasm';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.avif': return 'image/avif';
    case '.ico': return 'image/x-icon';
    case '.ttf': return 'font/ttf';
    case '.otf': return 'font/otf';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

// ── Protocol registration ────────────────────────────────────

/** Call BEFORE app.whenReady() to register the scheme as privileged. */
export function registerExtProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'sero-ext',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

/**
 * Call AFTER app.whenReady() to set up the protocol handler.
 *
 * Serves files from extension package ui/dist/ directories.
 */
export function setupExtProtocol(): void {
  protocol.handle('sero-ext', async (request) => {
    const url = new URL(request.url);
    const appId = url.hostname;
    let filePath = decodeURIComponent(url.pathname);

    // Security: reject null bytes
    if (filePath.includes('\0')) {
      return new Response('Forbidden', { status: 403 });
    }

    // Strip leading slash
    if (filePath.startsWith('/')) filePath = filePath.slice(1);
    if (!filePath) filePath = 'mf-manifest.json';

    const manifest = appRegistry.get(appId);
    if (!manifest) {
      return new Response(`Unknown app: ${appId}`, { status: 404 });
    }

    // Resolve to the dist/ui directory in the package
    const distDir = path.resolve(manifest.packagePath, 'dist', 'ui');
    const fullPath = path.resolve(distDir, filePath);

    // Security: ensure resolved path is within dist dir (prevents traversal)
    if (!fullPath.startsWith(distDir + path.sep) && fullPath !== distDir) {
      return new Response('Forbidden', { status: 403 });
    }

    // Security: resolve symlinks to catch symlink escape attacks
    // (e.g., a symlink inside dist/ui/ pointing to /etc/passwd)
    try {
      const realPath = realpathSync(fullPath);
      const realDistDir = realpathSync(distDir);
      if (!realPath.startsWith(realDistDir + path.sep) && realPath !== realDistDir) {
        return new Response('Forbidden', { status: 403 });
      }
    } catch {
      // File doesn't exist — the read below returns the 404
    }

    try {
      if (filePath === 'mf-manifest.json') {
        const rawManifest = await readFile(fullPath, 'utf8');
        return new Response(rewriteFederationManifest(rawManifest, appId), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      return new Response(await readFile(fullPath), {
        headers: { 'content-type': getAssetContentType(fullPath) },
      });
    } catch {
      return new Response(`Not found: ${filePath}`, { status: 404 });
    }
  });
}
