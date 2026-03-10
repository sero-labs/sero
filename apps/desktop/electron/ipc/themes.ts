/**
 * Theme IPC handlers — CRUD for theme preset JSON files.
 *
 * Built-in themes ship in the app bundle and are copied to
 * ~/.sero-ui/themes/builtin/ on first launch. Custom themes
 * live in ~/.sero-ui/themes/custom/.
 */

import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../src/types/ipc';
import { SERO_HOME } from '../env';
import type { ThemePreset, ThemePresetMeta } from '../../src/types/theme';

const THEMES_DIR = path.join(SERO_HOME, 'themes');
const BUILTIN_DIR = path.join(THEMES_DIR, 'builtin');
const CUSTOM_DIR = path.join(THEMES_DIR, 'custom');

/** Ensure theme directories exist. */
function ensureDirs(): void {
  mkdirSync(BUILTIN_DIR, { recursive: true });
  mkdirSync(CUSTOM_DIR, { recursive: true });
}

/** Copy bundled themes from resources/ to the user's builtin dir. */
function seedBuiltinThemes(): void {
  // In packaged app: resources/themes/; in dev: resources/themes/
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'themes'),
    path.join(__dirname, '..', '..', 'resources', 'themes'),
    path.join(process.cwd(), 'resources', 'themes'),
  ];
  for (const src of candidates) {
    if (!existsSync(src)) continue;
    const files = readdirSync(src).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const dest = path.join(BUILTIN_DIR, file);
      // Always overwrite built-ins to get latest on update
      try {
        copyFileSync(path.join(src, file), dest);
      } catch {
        // Ignore — non-critical
      }
    }
    break; // Found a valid source
  }
}

/** Read and parse a theme JSON file. Returns null on failure. */
async function readThemeFile(filePath: string): Promise<ThemePreset | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.name) {
      return parsed as ThemePreset;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract metadata from a theme preset. */
function toMeta(preset: ThemePreset, builtin: boolean): ThemePresetMeta {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    author: preset.author,
    builtin,
  };
}

/** List all .json files in a directory. */
function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

export function registerThemeHandlers(): void {
  ensureDirs();
  seedBuiltinThemes();

  // ── List all presets ────────────────────────────────────────
  ipcMain.handle(IpcChannels.themes.list, async (): Promise<ThemePresetMeta[]> => {
    const metas: ThemePresetMeta[] = [];

    for (const file of listJsonFiles(BUILTIN_DIR)) {
      const preset = await readThemeFile(file);
      if (preset) metas.push(toMeta(preset, true));
    }
    for (const file of listJsonFiles(CUSTOM_DIR)) {
      const preset = await readThemeFile(file);
      if (preset) metas.push(toMeta(preset, false));
    }

    return metas;
  });

  // ── Load a single preset by ID ─────────────────────────────
  ipcMain.handle(
    IpcChannels.themes.load,
    async (_e, id: string): Promise<ThemePreset | null> => {
      // Direct lookup by filename (IDs match filenames)
      for (const dir of [BUILTIN_DIR, CUSTOM_DIR]) {
        const filePath = path.join(dir, `${id}.json`);
        if (existsSync(filePath)) {
          const preset = await readThemeFile(filePath);
          if (preset) return preset;
        }
      }
      return null;
    },
  );

  // ── Save a custom preset ───────────────────────────────────
  ipcMain.handle(
    IpcChannels.themes.save,
    async (_e, preset: ThemePreset): Promise<void> => {
      ensureDirs();
      const fileName = `${preset.id}.json`;
      const filePath = path.join(CUSTOM_DIR, fileName);
      // Never allow overwriting built-in presets
      const builtinPath = path.join(BUILTIN_DIR, fileName);
      if (existsSync(builtinPath)) {
        throw new Error(`Cannot overwrite built-in theme: ${preset.id}`);
      }
      const data = { ...preset, builtin: false };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    },
  );

  // ── Delete a custom preset ─────────────────────────────────
  ipcMain.handle(
    IpcChannels.themes.delete,
    async (_e, id: string): Promise<void> => {
      const filePath = path.join(CUSTOM_DIR, `${id}.json`);
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
    },
  );

  // ── Import a theme from file dialog ────────────────────────
  ipcMain.handle(
    IpcChannels.themes.import,
    async (): Promise<ThemePreset | null> => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;

      const result = await dialog.showOpenDialog(win, {
        title: 'Import Theme',
        filters: [{ name: 'Theme JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) return null;

      const preset = await readThemeFile(result.filePaths[0]);
      if (!preset) return null;

      // Save to custom directory
      ensureDirs();
      const filePath = path.join(CUSTOM_DIR, `${preset.id}.json`);
      const data = { ...preset, builtin: false };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

      return data;
    },
  );

  // ── Export a theme to file dialog ──────────────────────────
  ipcMain.handle(
    IpcChannels.themes.export,
    async (_e, id: string): Promise<boolean> => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return false;

      // Find the preset by direct file lookup
      let preset: ThemePreset | null = null;
      for (const dir of [BUILTIN_DIR, CUSTOM_DIR]) {
        const filePath = path.join(dir, `${id}.json`);
        if (existsSync(filePath)) {
          preset = await readThemeFile(filePath);
          if (preset) break;
        }
      }
      if (!preset) return false;

      const result = await dialog.showSaveDialog(win, {
        title: 'Export Theme',
        defaultPath: `${preset.id}.json`,
        filters: [{ name: 'Theme JSON', extensions: ['json'] }],
      });

      if (result.canceled || !result.filePath) return false;

      const exportData = { ...preset, builtin: undefined };
      await fs.writeFile(
        result.filePath,
        JSON.stringify(exportData, null, 2),
        'utf8',
      );
      return true;
    },
  );
}
