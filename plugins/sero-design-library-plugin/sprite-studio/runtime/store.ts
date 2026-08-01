/**
 * Reading and writing Sprite Studio's records, and projecting them into state.
 *
 * The records are the authority and reactive state is a projection of them, so
 * an interrupted index write is a cache miss rather than data loss. Every
 * mutation goes through a record lock, because two writers that each read a
 * record and write back what they computed lose whichever change landed first —
 * and here that is reachable in ordinary use: a repair finishing while the user
 * renames the animation it belongs to.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DesignLibraryPaths } from '../../shared/paths';
import { isSafeId, relativeToHome } from '../../shared/paths';
import { readJsonFile, withRecordLock, writeJsonFile } from '../../shared/state-io';
import type { AnimationRecord, CharacterRecord, FrameRecord } from '../shared/character';
import type { AnimationSummary, CharacterSummary } from '../shared/state';
import {
  animationDir,
  animationRecordFile,
  animationsDir,
  characterDir,
  characterRecordFile,
  charactersDir,
  frameFile,
} from '../shared/paths';
import { decodeIndexedPng, encodeIndexedPng, palettesMatch } from './png';
import { CLIP_SECONDS } from './video';
import { fromHex, toHex } from '../engine/colour';
import type { CellGrid, Palette } from '../engine/types';

export async function readCharacter(
  paths: DesignLibraryPaths,
  characterId: string,
): Promise<CharacterRecord | null> {
  return readJsonFile<CharacterRecord>(characterRecordFile(paths, characterId));
}

export async function writeCharacter(
  paths: DesignLibraryPaths,
  character: CharacterRecord,
): Promise<void> {
  await writeJsonFile(characterRecordFile(paths, character.id), character);
}

/** Read, transform and write one character under its lock. */
export async function mutateCharacter(
  paths: DesignLibraryPaths,
  characterId: string,
  change: (character: CharacterRecord) => CharacterRecord,
): Promise<CharacterRecord | null> {
  const file = characterRecordFile(paths, characterId);
  return withRecordLock(paths, file, async () => {
    const current = await readJsonFile<CharacterRecord>(file);
    // A request naming something that no longer exists is a no-op rather than an
    // error: intent is submitted asynchronously and the world may have moved on.
    if (current === null) return null;
    const next = { ...change(current), updatedAt: Date.now() };
    await writeJsonFile(file, next);
    return next;
  });
}

export async function listCharacters(paths: DesignLibraryPaths): Promise<CharacterRecord[]> {
  const entries = await readdir(charactersDir(paths), { withFileTypes: true }).catch(() => []);
  const characters: CharacterRecord[] = [];
  for (const entry of entries) {
    // A directory that is not a character id is not a character. The path
    // helpers refuse an unsafe id by design, and letting that refusal escape
    // here would take the whole projection down over one stray directory —
    // which is exactly what a `.staging` folder in this tree did.
    if (!entry.isDirectory() || !isSafeId(entry.name)) continue;
    const record = await readCharacter(paths, entry.name);
    if (record !== null) characters.push(record);
  }
  return characters.toSorted((a, b) => b.updatedAt - a.updatedAt);
}

export async function readAnimation(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
): Promise<AnimationRecord | null> {
  return readJsonFile<AnimationRecord>(animationRecordFile(paths, characterId, animationId));
}

export async function writeAnimation(
  paths: DesignLibraryPaths,
  animation: AnimationRecord,
): Promise<void> {
  await writeJsonFile(animationRecordFile(paths, animation.characterId, animation.id), animation);
}

export async function mutateAnimation(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
  change: (animation: AnimationRecord) => AnimationRecord,
): Promise<AnimationRecord | null> {
  const file = animationRecordFile(paths, characterId, animationId);
  return withRecordLock(paths, file, async () => {
    const current = await readJsonFile<AnimationRecord>(file);
    if (current === null) return null;
    const next = { ...change(current), updatedAt: Date.now() };
    await writeJsonFile(file, next);
    return next;
  });
}

export async function listAnimations(
  paths: DesignLibraryPaths,
  characterId: string,
): Promise<AnimationRecord[]> {
  const entries = await readdir(animationsDir(paths, characterId), { withFileTypes: true }).catch(
    () => [],
  );
  const animations: AnimationRecord[] = [];
  for (const entry of entries) {
    // Same rule as the character scan: a directory that is not an animation id
    // is not an animation, and refusing it must not take the scan down.
    if (!entry.isDirectory() || !isSafeId(entry.name)) continue;
    const record = await readAnimation(paths, characterId, entry.name);
    if (record !== null) animations.push(record);
  }
  return animations.toSorted((a, b) => a.createdAt - b.createdAt);
}

/** Find an animation without knowing which character owns it. */
export async function findAnimation(
  paths: DesignLibraryPaths,
  animationId: string,
): Promise<AnimationRecord | null> {
  for (const character of await listCharacters(paths)) {
    const animation = await readAnimation(paths, character.id, animationId);
    if (animation !== null) return animation;
  }
  return null;
}

export async function destroyCharacter(
  paths: DesignLibraryPaths,
  characterId: string,
): Promise<void> {
  await rm(characterDir(paths, characterId), { recursive: true, force: true });
}

export async function destroyAnimation(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
): Promise<void> {
  await rm(animationDir(paths, characterId, animationId), { recursive: true, force: true });
}

/** The palette as the engine wants it. */
export function paletteOf(character: CharacterRecord): Palette {
  return character.palette.map((hex) => fromHex(hex) ?? [0, 0, 0]);
}

export function paletteToHexes(palette: Palette): string[] {
  return palette.map((entry) => toHex(entry));
}

/**
 * Write one frame as an indexed PNG and return its path relative to home.
 *
 * The palette travels into the file rather than being assumed, so a frame is
 * self-describing and can be checked against the character when it is read.
 */
export async function writeFrame(
  paths: DesignLibraryPaths,
  character: CharacterRecord,
  animationId: string,
  frameId: string,
  cells: CellGrid,
): Promise<string> {
  const file = frameFile(paths, character.id, animationId, frameId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, encodeIndexedPng(cells.cells, cells.cols, cells.rows, paletteOf(character)));
  return relativeToHome(paths, file);
}

/**
 * Read one frame back, refusing a file whose palette has been edited elsewhere.
 *
 * This is what makes the storage format's promise hold. Without it, "the frames
 * are indexed" would be a claim about how they were written rather than a
 * property of what is on disk.
 */
export async function readFrame(
  paths: DesignLibraryPaths,
  character: CharacterRecord,
  frame: FrameRecord,
): Promise<CellGrid> {
  const file = path.join(paths.home, frame.file);
  const image = decodeIndexedPng(await readFile(file));
  if (!palettesMatch(image.palette, paletteOf(character))) {
    throw new Error(
      `Frame ${frame.id} carries a different palette from its character. It was edited outside Sprite Studio, and using it would put a colour on the sprite that the character does not have.`,
    );
  }
  return { cols: image.width, rows: image.height, cells: image.cells };
}

export function characterSummary(
  character: CharacterRecord,
  animations: AnimationRecord[],
): CharacterSummary {
  return {
    id: character.id,
    name: character.name,
    status: character.status,
    source: character.source,
    previewPath: character.basePoseFile,
    artWidth: character.artWidth,
    artHeight: character.artHeight,
    palette: character.palette,
    animationCount: animations.filter((animation) => animation.deletedAt === undefined).length,
    awaitingApproval: animations.filter((animation) => animation.status === 'ready').length,
    // Off the record, not off the previous projection. The projection is
    // rebuilt from the records after every change, so a flag held only in state
    // is cleared by the next thing that happens.
    favourite: character.favourite === true,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
    ...(character.deletedAt === undefined ? {} : { deletedAt: character.deletedAt }),
  };
}

/**
 * How many frames to pull out of a clip.
 *
 * The runtime has no codecs, so it cannot ask the clip how long it is. This is
 * the ceiling; the page samples whichever is smaller, this or what the clip
 * actually holds.
 */
export function samplesPerClip(sampleFps: number): number {
  return Math.round(CLIP_SECONDS * Math.max(1, sampleFps)) + 1;
}

export function animationSummary(animation: AnimationRecord, sampleFps: number): AnimationSummary {
  return {
    id: animation.id,
    characterId: animation.characterId,
    name: animation.plan.name,
    status: animation.status,
    loop: animation.plan.loop,
    playRate: animation.plan.playRate,
    frameCount: animation.frames.length,
    canvas: animation.canvas,
    hasWarnings:
      animation.findings.some((finding) => finding.level === 'warn') ||
      animation.frames.some((frame) => frame.findings.length > 0),
    report: animation.report,
    updatedAt: animation.updatedAt,
    ...(animation.error === undefined ? {} : { error: animation.error }),
    ...(animation.approvedAt === undefined ? {} : { approvedAt: animation.approvedAt }),
    // The whole second half of an animation hangs off this. Without it the
    // clip is paid for, stored, and never opened by anything.
    ...(animation.status === 'awaiting-frames' && animation.clipFile !== undefined
      ? {
          awaitingFrames: {
            clipPath: animation.clipFile,
            sampleFps,
            expectedFrames: samplesPerClip(sampleFps),
          },
        }
      : {}),
  };
}
