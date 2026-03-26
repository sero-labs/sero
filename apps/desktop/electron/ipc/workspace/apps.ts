/**
 * Apps IPC handlers — discovery + new-app detection.
 *
 * Watches packages/pi-* for new sero app packages created while Sero
 * is running (e.g. by the agent). Sends a push event to the renderer
 * so a restart banner can be shown.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { watch, readFileSync, existsSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../../src/types/ipc';
import type { SeroAppManifest } from '../../../src/types/ipc';
import { discoverApps } from '../../extensions/app-discovery';

export function registerAppsHandlers(): void {
  ipcMain.handle(
    IpcChannels.apps.discover,
    async (): Promise<SeroAppManifest[]> => {
      return discoverApps();
    },
  );
}

/**
 * Watch packages/ for new sero app packages.
 *
 * Records known app IDs at startup, then watches the packages directory
 * for changes. When a new pi-* directory gains a package.json with a
 * sero.app manifest, pushes a notification to the renderer.
 *
 * @param knownAppIds Set of app IDs discovered at startup
 */
export function watchForNewApps(knownAppIds: Set<string>): void {
  // __dirname is apps/desktop/dist/electron/ at runtime
  const pkgsDir = path.resolve(__dirname, '../../../../packages');
  if (!existsSync(pkgsDir)) return;

  const notified = new Set<string>();
  let debounce: ReturnType<typeof setTimeout> | null = null;

  watch(pkgsDir, { recursive: true }, (_eventType, filename) => {
    // Only care about package.json files in pi-* directories
    if (!filename || !filename.includes('package.json')) return;
    if (!filename.startsWith('pi-')) return;

    // Debounce — agent writes multiple files in quick succession
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      checkForNewApps(pkgsDir, knownAppIds, notified);
    }, 2000);
  });

  console.log('[app-watcher] Watching for new app packages');
}

function checkForNewApps(
  pkgsDir: string,
  knownAppIds: Set<string>,
  notified: Set<string>,
): void {
  try {
    const { readdirSync } = require('fs');
    const dirs: string[] = readdirSync(pkgsDir);

    for (const dir of dirs) {
      if (!dir.startsWith('pi-')) continue;

      const pkgPath = path.join(pkgsDir, dir, 'package.json');
      if (!existsSync(pkgPath)) continue;

      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const app = pkg.sero?.app;
        if (!app?.id || !app?.name) continue;

        // Skip if already known at startup or already notified
        if (knownAppIds.has(app.id)) continue;
        if (notified.has(app.id)) continue;

        notified.add(app.id);
        console.log(`[app-watcher] New app detected: ${app.name} (${app.id})`);

        // Push to all renderer windows
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(
            IpcChannels.apps.newAppDetected,
            app.name,
          );
        }
      } catch {
        // package.json not yet valid JSON (still being written)
      }
    }
  } catch (err) {
    console.error('[app-watcher] Scan error:', err);
  }
}
