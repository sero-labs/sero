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

import { protocol, net } from 'electron';
import path from 'path';
import type { SeroAppManifest } from '../src/types/ipc';

// ── App registry (populated by discovery) ────────────────────

const appRegistry = new Map<string, SeroAppManifest>();

/** Register a discovered app so its assets can be served. */
export function registerExtAssets(manifest: SeroAppManifest): void {
  appRegistry.set(manifest.id, manifest);
}

/** Register multiple discovered apps. */
export function registerAllExtAssets(manifests: SeroAppManifest[]): void {
  for (const m of manifests) {
    if (m.uiEntry) {
      appRegistry.set(m.id, m);
    }
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

    try {
      return await net.fetch(`file://${fullPath}`);
    } catch {
      return new Response(`Not found: ${filePath}`, { status: 404 });
    }
  });
}
