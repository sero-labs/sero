/**
 * Where Sprite Studio keeps its files.
 *
 * Beside the existing trees, under `characters/<id>/`, so lifting the folder
 * into its own plugin later moves one directory rather than untangling one
 * (D6, spec §9).
 *
 * Every id here arrives from a tool caller, so it is untrusted input used to
 * build a path — and one of those paths is handed to a recursive delete. The
 * safety check lives inside these helpers rather than at each call site, so a
 * new call site cannot forget.
 */

import path from 'node:path';

import { assertSafeId, type DesignLibraryPaths } from '../../shared/paths';

export function charactersDir(paths: DesignLibraryPaths): string {
  return path.join(paths.home, 'characters');
}

export function characterDir(paths: DesignLibraryPaths, characterId: string): string {
  return path.join(charactersDir(paths), assertSafeId(characterId, 'character id'));
}

export function characterRecordFile(paths: DesignLibraryPaths, characterId: string): string {
  return path.join(characterDir(paths, characterId), 'record.json');
}

/** The recovered base pose, an indexed PNG at the character's true size. */
export function basePoseFile(paths: DesignLibraryPaths, characterId: string): string {
  return path.join(characterDir(paths, characterId), 'base-pose.png');
}

/** The picture the character was made from, kept so it can be re-measured. */
export function characterSourceFile(
  paths: DesignLibraryPaths,
  characterId: string,
  name: string,
): string {
  return path.join(characterDir(paths, characterId), 'source', path.basename(name));
}

export function animationsDir(paths: DesignLibraryPaths, characterId: string): string {
  return path.join(characterDir(paths, characterId), 'animations');
}

export function animationDir(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
): string {
  return path.join(animationsDir(paths, characterId), assertSafeId(animationId, 'animation id'));
}

export function animationRecordFile(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
): string {
  return path.join(animationDir(paths, characterId, animationId), 'record.json');
}

/** One indexed PNG per frame. Frames are written once and never rewritten. */
export function frameFile(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
  frameId: string,
): string {
  return path.join(
    animationDir(paths, characterId, animationId),
    'frames',
    `${assertSafeId(frameId, 'frame id')}.png`,
  );
}

/**
 * The compiled sprite for every sampled frame, drawn for the review screen.
 *
 * A raw video still is not what the sprite will look like, and judging a take
 * from 480p video frames would be judging something we are not going to ship.
 * These are the quantised article, at the character's palette and scale. They
 * live only while the review is open and are cleared when it is settled.
 */
export function samplesDir(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
): string {
  return path.join(animationDir(paths, characterId, animationId), 'samples');
}

/** One sample preview. Numbers are padded so name order is time order. */
export function sampleFile(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
  index: number,
): string {
  return path.join(samplesDir(paths, characterId, animationId), `${sampleName(index)}.png`);
}

export function sampleName(index: number): string {
  return String(index).padStart(3, '0');
}

/** The clip an animation was drawn from, kept for a re-cut without re-paying. */
export function clipFile(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
  name: string,
): string {
  return path.join(animationDir(paths, characterId, animationId), 'clip', path.basename(name));
}

/** The plate handed to the video model: the character on flat magenta (D7). */
export function plateFile(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
): string {
  return path.join(animationDir(paths, characterId, animationId), 'plate.png');
}

export function exportsDir(paths: DesignLibraryPaths, characterId: string): string {
  return path.join(characterDir(paths, characterId), 'exports');
}

export function exportDir(
  paths: DesignLibraryPaths,
  characterId: string,
  exportId: string,
): string {
  return path.join(exportsDir(paths, characterId), assertSafeId(exportId, 'export id'));
}
