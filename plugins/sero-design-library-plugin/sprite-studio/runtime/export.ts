/**
 * Export: one indexed PNG sheet and one Aseprite atlas (D16, spec §7).
 *
 * Two files and no more. Aseprite's JSON is already read by most engines and
 * tools, so the output is useful without a loader being written first, and the
 * anchor, the palette and the character id travel in `meta.sero` — a game should
 * not have to be told where the character's feet are when the file knows.
 *
 * Nothing here decides anything about the pixels. The sheet comes from the
 * engine, the atlas comes from the engine, and this file is the part that has a
 * file system: it reads the records, hands the grids over, encodes the buffer
 * and puts the two files where the user asked for them (D15).
 *
 * The pair is built under the character's own `exports/<exportId>/` and copied
 * from there. That directory is what the export id names, and building in it
 * first means the copy that lands in the user's assets folder is renamed into
 * place complete rather than growing under a name a build is watching.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, realpath, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { DesignLibraryPaths } from '../../shared/paths';
import { writeJsonFile } from '../../shared/state-io';
import { buildAtlas } from '../engine/atlas';
import { buildSheet, resolveScale, type SheetAnimation } from '../engine/sheet';
import type { AnimationRecord, CharacterRecord } from '../shared/character';
import { exportDir } from '../shared/paths';
import type { SpriteExportOptions } from '../shared/state';
import { encodeIndexedPng } from './png';
import { listAnimations, paletteOf, readCharacter, readFrame } from './store';

/**
 * What the user chose on the export screen, plus the same question asked as a
 * size: "512 px tall" rather than "4×". A height is resolved to a whole scale
 * and the real height is reported, because a fractional scale blurs the pixels
 * (D3).
 */
export interface SpriteExportRequestOptions extends SpriteExportOptions {
  height?: number;
}

export interface SpriteExportRequest {
  exportId: string;
  characterId: string;
  /** The animations the user included, in the order they are to be laid out. */
  animationIds: string[];
  options: SpriteExportRequestOptions;
}

export interface SpriteExportEnvironment {
  /** The open workspace a workspace export has to stay inside. */
  workspacePath?: string;
  downloadsDir?: string;
}

/** Enough for the page to say what it produced. */
export interface SpriteExportResult {
  sheetFile: string;
  atlasFile: string;
  width: number;
  height: number;
  frames: number;
  /** A whole number, always (D3). */
  scale: number;
  /** The character's real height at that scale, which a height request rarely asked for. */
  spriteHeight: number;
}

/**
 * The pair is named after the character rather than after the export, because
 * the atlas names the image beside it and a developer reads both file names.
 */
function fileStem(character: CharacterRecord): string {
  const stem = character.name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .toLowerCase();
  return stem === '' ? character.id : stem;
}

/** The whole scale to export at, and what the character really comes out at. */
function resolvedScale(
  character: CharacterRecord,
  options: SpriteExportRequestOptions,
): { scale: number; height: number } {
  if (options.height !== undefined && options.height > 0) {
    return resolveScale(character.artHeight, options.height);
  }
  const scale = Math.max(1, Math.round(options.scale));
  return { scale, height: scale * character.artHeight };
}

async function chosenAnimations(
  paths: DesignLibraryPaths,
  request: SpriteExportRequest,
): Promise<AnimationRecord[]> {
  if (request.animationIds.length === 0) throw new Error('Nothing was chosen to export.');
  const available = new Map(
    (await listAnimations(paths, request.characterId)).map((animation) => [animation.id, animation]),
  );
  return request.animationIds.map((id) => {
    const animation = available.get(id);
    // An animation deleted since the export screen was opened would otherwise
    // become an empty row with a tag pointing at frames that are not there.
    if (animation === undefined || animation.deletedAt !== undefined) {
      throw new Error(`One of the chosen animations is no longer available: ${id}.`);
    }
    if (animation.frames.length === 0) {
      throw new Error(`${animation.plan.name} has no frames to export.`);
    }
    return animation;
  });
}

async function loadFrames(
  paths: DesignLibraryPaths,
  character: CharacterRecord,
  animations: AnimationRecord[],
): Promise<SheetAnimation[]> {
  const loaded: SheetAnimation[] = [];
  for (const animation of animations) {
    const frames: SheetAnimation['frames'] = [];
    for (const frame of animation.frames) {
      // Through the store, so a frame whose palette was edited elsewhere is
      // refused here rather than quietly putting a colour on the sheet that the
      // character does not own.
      const cells = await readFrame(paths, character, frame);
      // Every frame of an animation shares its canvas, and the sheet takes the
      // cell size from the first of them. A frame of another size would be
      // cropped or leave a gap, and the atlas would still claim it fitted.
      if (cells.cols !== animation.canvas.cols || cells.rows !== animation.canvas.rows) {
        throw new Error(
          `Frame ${frame.id} of ${animation.plan.name} is ${cells.cols} × ${cells.rows}, not the animation's ${animation.canvas.cols} × ${animation.canvas.rows} canvas.`,
        );
      }
      frames.push({ cells, durationMs: frame.durationMs });
    }
    loaded.push({
      name: animation.plan.name,
      loop: animation.plan.loop,
      playRate: animation.plan.playRate,
      // The frames the animation holds, in its own order. A ping-pong animation
      // is not unrolled: the atlas carries `direction`, and the engine plays it
      // out and back from these frames (D34).
      frames,
      anchorCol: animation.anchor.col,
      anchorRow: animation.anchor.row,
    });
  }
  return loaded;
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * Where a path really lands: the deepest part of it that exists, resolved
 * through any symbolic link, with the part that does not exist yet on the end.
 *
 * Comparing the two paths as text is not enough. A link anywhere along the way
 * can carry the export straight out of the workspace, and on macOS even an
 * honest temporary directory is reached through one.
 */
async function realTarget(target: string): Promise<string> {
  let existing = target;
  const missing: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return target;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(await realpath(existing), ...missing);
}

/**
 * The folder the pair is delivered to.
 *
 * A workspace path arrives from the page as a string, so it is untrusted input
 * naming the user's own files, and it is refused if it lands outside the open
 * workspace — the check the Gallery export makes.
 *
 * Unlike that one, a symbolic link is followed and then judged by where it
 * really goes. The Gallery export refuses a link outright because it replaces
 * the whole folder, and swapping a directory the user linked in would destroy
 * work; this writes two files into the folder, so the only question is whether
 * the folder is inside the workspace.
 */
async function destinationRoot(
  destination: SpriteExportOptions['destination'],
  environment: SpriteExportEnvironment,
): Promise<string> {
  if (destination.kind === 'downloads') {
    return environment.downloadsDir ?? path.join(os.homedir(), 'Downloads');
  }
  const workspace = environment.workspacePath?.trim();
  if (workspace === undefined || workspace === '') {
    throw new Error('There is no active workspace for this export.');
  }
  const root = await realpath(workspace);
  const target = await realTarget(path.resolve(root, destination.path));
  if (!inside(root, target)) {
    throw new Error('The export folder resolves outside the active workspace.');
  }
  return target;
}

/** Copy under a temporary name and rename, so no half-written file is ever seen. */
async function deliver(source: string, target: string): Promise<void> {
  if (source === target) return;
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp`);
  await copyFile(source, temporary);
  await rename(temporary, target);
}

export async function exportCharacter(
  paths: DesignLibraryPaths,
  request: SpriteExportRequest,
  environment: SpriteExportEnvironment = {},
): Promise<SpriteExportResult> {
  const character = await readCharacter(paths, request.characterId);
  if (character === null) throw new Error('That character is no longer available.');

  const animations = await chosenAnimations(paths, request);
  const { scale, height: spriteHeight } = resolvedScale(character, request.options);
  const palette = paletteOf(character);

  const sheet = buildSheet(await loadFrames(paths, character, animations), {
    layout: request.options.layout,
    scale,
    uniformCell: request.options.uniformCell,
    trim: request.options.trim,
  });
  const stem = fileStem(character);
  const image = `${stem}.png`;
  const atlas = buildAtlas(sheet, {
    image,
    characterId: character.id,
    artHeight: character.artHeight,
    palette,
    scale,
  });

  const built = exportDir(paths, request.characterId, request.exportId);
  await mkdir(built, { recursive: true });
  const builtSheet = path.join(built, image);
  const builtAtlas = path.join(built, `${stem}.json`);
  // Indexed, never RGBA: RGBA could carry a colour the character does not have,
  // which is the one thing the whole pipeline exists to prevent (D2).
  await writeFile(builtSheet, encodeIndexedPng(sheet.cells, sheet.width, sheet.height, palette));
  await writeJsonFile(builtAtlas, atlas);

  const root = await destinationRoot(request.options.destination, environment);
  await mkdir(root, { recursive: true });
  const sheetFile = path.join(root, image);
  const atlasFile = path.join(root, `${stem}.json`);
  await deliver(builtSheet, sheetFile);
  await deliver(builtAtlas, atlasFile);

  return {
    sheetFile,
    atlasFile,
    width: sheet.width,
    height: sheet.height,
    frames: sheet.frames.length,
    scale,
    spriteHeight,
  };
}
