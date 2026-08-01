import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Plumbing for the Sprite Studio end-to-end spec.
 *
 * The spec itself is the story — picture in, sprite sheet out. Everything here
 * is the part that is not the story: where the plugin keeps its files, how to
 * wait for a background runtime that reports through a state file, and how to
 * read a PNG without a decoder.
 */

/** The Design Library plugin's storage, inside a profile's Sero home. */
export function designLibraryHome(profilePath: string): string {
  return path.join(profilePath, 'apps', 'design-library');
}

/**
 * Where the app actually put the active profile.
 *
 * Read after launch rather than predicted before it: the app owns profile
 * resolution and may move or rename what a test seeded, and a test that guessed
 * would sit watching an empty directory while the real one filled up.
 */
export function activeProfilePath(seroHome: string): string {
  const registry = path.join(seroHome, '.sero-ui', 'profiles.json');
  const parsed = readJson<{
    activeProfileId?: string;
    profiles?: { id: string; path: string }[];
  }>(registry);
  const active =
    parsed?.profiles?.find((one) => one.id === parsed.activeProfileId) ?? parsed?.profiles?.[0];
  if (active === undefined) throw new Error(`No profile is registered in ${registry}.`);
  return active.path;
}

/**
 * Settings the runtime reads before its first paid call.
 *
 * Written straight into the state file, which is the runtime's job everywhere
 * else — allowed only here, and only in the gap between the app starting and
 * anything being asked of it, when there is no work in flight to lose.
 */
export function patchSpriteSettings(home: string, settings: Record<string, unknown>): void {
  const file = path.join(home, 'state.json');
  fs.mkdirSync(home, { recursive: true });
  const current = readJson<Record<string, unknown>>(file) ?? {};
  const sprite = (current.sprite ?? {}) as Record<string, unknown>;
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        ...current,
        sprite: {
          ...sprite,
          settings: { ...((sprite.settings ?? {}) as Record<string, unknown>), ...settings },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

export interface SpriteCharacterRecord {
  id: string;
  name: string;
  status: string;
  artWidth: number;
  artHeight: number;
  palette: string[];
  basePoseFile: string;
  ingestion: { block: number; lift: number; sourceWidth: number; sourceHeight: number };
  root: { footRow: number; centreCol: number };
}

export interface SpriteAnimationRecord {
  id: string;
  characterId: string;
  status: string;
  error?: string;
  canvas: { cols: number; rows: number };
  frames: { id: string; file: string; durationMs: number }[];
  report: { loop?: unknown } | null;
  findings: { check: string; level: string; message: string }[];
  /** Set only while the frames are waiting to be picked. */
  review?: { stagingKey: string; sampleCount: number; proposed: number[] };
}

export interface SpriteState {
  sprite: {
    characters: { id: string; name: string; status: string }[];
    animations: {
      id: string;
      status: string;
      progress?: string;
      frameCount: number;
      awaitingFrames?: { clipPath: string; sampleFps: number; expectedFrames: number };
      review?: { sampleCount: number; proposed: number[]; previewDir: string; clipPath?: string };
    }[];
    notice?: { message: string };
    settings: Record<string, unknown>;
  };
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    // A half-written state file is a retry, not a failure: the runtime writes
    // it while the test is reading it.
    return null;
  }
}

export function readSpriteState(home: string): SpriteState | null {
  return readJson<SpriteState>(path.join(home, 'state.json'));
}

export function listCharacterRecords(home: string): SpriteCharacterRecord[] {
  const root = path.join(home, 'characters');
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .flatMap((id) => {
      const record = readJson<SpriteCharacterRecord>(path.join(root, id, 'record.json'));
      return record === null ? [] : [record];
    });
}

export function listAnimationRecords(home: string, characterId: string): SpriteAnimationRecord[] {
  const root = path.join(home, 'characters', characterId, 'animations');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).flatMap((id) => {
    const record = readJson<SpriteAnimationRecord>(path.join(root, id, 'record.json'));
    return record === null ? [] : [record];
  });
}

/**
 * A PNG's header, without a decoder.
 *
 * Enough to prove a sheet is the size it claims and is indexed. Anything more
 * belongs in the engine's own tests, which already have one.
 */
export interface PngHeader {
  width: number;
  height: number;
  /** 3 is indexed-with-a-palette, which is the only kind Sprite Studio writes. */
  colourType: number;
  paletteEntries: number;
}

export function readPngHeader(file: string): PngHeader {
  const bytes = fs.readFileSync(file);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colourType = bytes[25] ?? -1;

  let paletteEntries = 0;
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('ascii');
    if (type === 'PLTE') paletteEntries = length / 3;
    if (type === 'IEND') break;
    at += 12 + length;
  }
  return { width, height, colourType, paletteEntries };
}

/**
 * Wait for something the background runtime writes to disk.
 *
 * Nothing in Sprite Studio finishes on a click: a request is appended, a
 * runtime in another process applies it, and the answer lands in a record. The
 * screen follows the record, so the record is what a test waits on.
 */
export async function until<T>(
  what: string,
  read: () => T | null | undefined,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== null && value !== undefined && value !== false) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Open the Design Library and switch to Sprite Studio. */
export async function openSpriteStudio(page: Page): Promise<void> {
  const opened = await page.evaluate(() =>
    Boolean(window.__appControl?.openApp('design-library')),
  );
  expect(opened).toBe(true);
  const panel = page.locator('[data-app="design-library"]').first();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByRole('button', { name: 'Sprite Studio' }).click();
}

export function spriteStudioPanel(page: Page) {
  return page.locator('[data-app="design-library"]').first();
}
