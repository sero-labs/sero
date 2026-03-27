/**
 * Theme IPC handlers — CRUD for theme preset JSON files.
 *
 * All themes (defaults + custom) live in a single flat directory:
 *   ~/.sero-ui/themes/
 *
 * Default themes are copied from packages/templates/themes/ on first
 * launch by ensureDefaultThemes() in electron/profile/setup.ts.
 * Since they're user-owned copies, they can be freely edited.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../../../src/types/ipc';
import { SERO_HOME } from '../../../platform/env';
import type { ThemePreset, ThemePresetMeta } from '../../../../src/types/theme';

const THEMES_DIR = path.join(SERO_HOME, 'themes');

/** Resolve the path to built-in theme templates (packages/templates/themes/). */
function getTemplatesDir(): string {
  return path.resolve(__dirname, '../../../../packages/templates/themes');
}

/** Ensure theme directory exists. */
function ensureDir(): void {
  mkdirSync(THEMES_DIR, { recursive: true });
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
function toMeta(preset: ThemePreset): ThemePresetMeta {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    author: preset.author,
    builtin: preset.builtin ?? false,
  };
}

/** List all .json file paths in THEMES_DIR. */
function listThemeFiles(): string[] {
  if (!existsSync(THEMES_DIR)) return [];
  return readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(THEMES_DIR, f));
}

export function registerThemeHandlers(): void {
  ensureDir();

  // ── List all presets ────────────────────────────────────────
  ipcMain.handle(IpcChannels.themes.list, async (): Promise<ThemePresetMeta[]> => {
    const metas: ThemePresetMeta[] = [];
    for (const file of listThemeFiles()) {
      const preset = await readThemeFile(file);
      if (preset) metas.push(toMeta(preset));
    }
    return metas;
  });

  // ── Load a single preset by ID ─────────────────────────────
  ipcMain.handle(
    IpcChannels.themes.load,
    async (_e, id: string): Promise<ThemePreset | null> => {
      const filePath = path.join(THEMES_DIR, `${id}.json`);
      if (!existsSync(filePath)) return null;
      return readThemeFile(filePath);
    },
  );

  // ── Save a preset (create or update) ───────────────────────
  ipcMain.handle(
    IpcChannels.themes.save,
    async (_e, preset: ThemePreset): Promise<void> => {
      ensureDir();
      const filePath = path.join(THEMES_DIR, `${preset.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(preset, null, 2), 'utf8');
    },
  );

  // ── Delete a preset ────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.themes.delete,
    async (_e, id: string): Promise<void> => {
      const filePath = path.join(THEMES_DIR, `${id}.json`);
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

      // Save to themes directory
      ensureDir();
      const filePath = path.join(THEMES_DIR, `${preset.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(preset, null, 2), 'utf8');
      return preset;
    },
  );

  // ── Export a theme to file dialog ──────────────────────────
  ipcMain.handle(
    IpcChannels.themes.export,
    async (_e, id: string): Promise<boolean> => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return false;

      const filePath = path.join(THEMES_DIR, `${id}.json`);
      if (!existsSync(filePath)) return false;

      const preset = await readThemeFile(filePath);
      if (!preset) return false;

      const result = await dialog.showSaveDialog(win, {
        title: 'Export Theme',
        defaultPath: `${preset.id}.json`,
        filters: [{ name: 'Theme JSON', extensions: ['json'] }],
      });

      if (result.canceled || !result.filePath) return false;

      await fs.writeFile(
        result.filePath,
        JSON.stringify(preset, null, 2),
        'utf8',
      );
      return true;
    },
  );

  // ── Reset a built-in theme to its template ─────────────────
  ipcMain.handle(
    IpcChannels.themes.reset,
    async (_e, id: string): Promise<ThemePreset | null> => {
      const templatePath = path.join(getTemplatesDir(), `${id}.json`);
      if (!existsSync(templatePath)) return null; // Not a built-in theme

      const preset = await readThemeFile(templatePath);
      if (!preset) return null;

      // Overwrite the user's copy
      ensureDir();
      const destPath = path.join(THEMES_DIR, `${id}.json`);
      await fs.copyFile(templatePath, destPath);

      return preset;
    },
  );
}
