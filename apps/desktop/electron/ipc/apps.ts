/**
 * Apps IPC handlers — discovery + new-app detection.
 *
 * Watches workspace app directories for new sero app packages created while
 * Sero is running (e.g. by the agent). Sends a push event to the renderer so
 * a restart banner can be shown.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { watch, readFileSync, existsSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../src/types/ipc';
import type { SeroAppManifest } from '../../src/types/ipc';
import { discoverApps } from '../app-discovery';

const APP_ROOTS = [
  {
    dir: path.resolve(__dirname, '../../../../packages'),
    matchesDirName: (dir: string) => dir.startsWith('pi-'),
  },
  {
    dir: path.resolve(__dirname, '../../../../plugins'),
    matchesDirName: (dir: string) => dir.startsWith('sero-') && dir.endsWith('-plugin'),
  },
];

export function registerAppsHandlers(): void {
  ipcMain.handle(
    IpcChannels.apps.discover,
    async (): Promise<SeroAppManifest[]> => {
      return discoverApps();
    },
  );
}

/**
 * Watch workspace app directories for new sero app packages.
 *
 * Records known app IDs at startup, then watches the packages/ and plugins/
 * directories for changes. When a new app directory gains a package.json with a
 * sero.app manifest, pushes a notification to the renderer.
 *
 * @param knownAppIds Set of app IDs discovered at startup
 */
export function watchForNewApps(knownAppIds: Set<string>): void {
  const notified = new Set<string>();

  for (const root of APP_ROOTS) {
    if (!existsSync(root.dir)) continue;

    let debounce: ReturnType<typeof setTimeout> | null = null;

    watch(root.dir, { recursive: true }, (_eventType, filename) => {
      if (!filename || !filename.includes('package.json')) return;

      const [topLevelDir] = filename.split(path.sep);
      if (!topLevelDir || !root.matchesDirName(topLevelDir)) return;

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        checkForNewApps(root.dir, root.matchesDirName, knownAppIds, notified);
      }, 2000);
    });
  }

  console.log('[app-watcher] Watching for new app packages');
}

function checkForNewApps(
  rootDir: string,
  matchesDirName: (dir: string) => boolean,
  knownAppIds: Set<string>,
  notified: Set<string>,
): void {
  try {
    const { readdirSync } = require('fs');
    const dirs: string[] = readdirSync(rootDir);

    for (const dir of dirs) {
      if (!matchesDirName(dir)) continue;

      const pkgPath = path.join(rootDir, dir, 'package.json');
      if (!existsSync(pkgPath)) continue;

      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const app = pkg.sero?.app;
        if (!app?.id || !app?.name) continue;

        if (knownAppIds.has(app.id) || notified.has(app.id)) continue;

        notified.add(app.id);
        console.log(`[app-watcher] New app detected: ${app.name} (${app.id})`);

        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IpcChannels.apps.newAppDetected, app.name);
        }
      } catch {
        // package.json not yet valid JSON (still being written)
      }
    }
  } catch (err) {
    console.error('[app-watcher] Scan error:', err);
  }
}
