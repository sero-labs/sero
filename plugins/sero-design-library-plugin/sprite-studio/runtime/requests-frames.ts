/**
 * Frame-level intent: the edits a user makes to a finished sequence.
 *
 * Every one of these names an animation that may no longer exist, and every one
 * is a no-op when it does not — intent is submitted asynchronously and the world
 * moves on. Kept apart from the request dispatcher because these are the
 * handlers that touch pixels rather than records.
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { relativeToHome, type DesignLibraryPaths } from '../../shared/paths';
import type { AnimationRecord, FrameRecord } from '../shared/character';
import type { SpriteRequestBody } from '../shared/state';
import { animationDir } from '../shared/paths';
import { clearStaged, readStaged } from './staging';
import { findAnimation, mutateAnimation } from './store';

export type FrameRequest = Extract<SpriteRequestBody, { kind: `sprite.frame.${string}` }>;

export function isFrameRequest(body: SpriteRequestBody): body is FrameRequest {
  return body.kind.startsWith('sprite.frame.');
}

/**
 * Apply one frame request.
 *
 * Returns whether anything changed, so the caller knows whether to re-project.
 * A request naming a frame that has gone changes nothing and says so.
 */
export async function applyFrameRequest(
  paths: DesignLibraryPaths,
  body: FrameRequest,
): Promise<boolean> {
  const animation = await findAnimation(paths, body.animationId);
  if (animation === null) return false;

  switch (body.kind) {
    case 'sprite.frame.write': {
      const file = (await readStaged(paths, body.stagingKey))[0];
      if (file === undefined) return false;
      await writeHandEdit(paths, animation, body.frameId, file.bytes);
      await clearStaged(paths, body.stagingKey);
      return true;
    }

    case 'sprite.frame.duplicate': {
      const source = animation.frames.find((frame) => frame.id === body.frameId);
      if (source === undefined) return false;
      // The request log is applied at-least-once, so a replay must not insert a
      // second copy under the same id. Two frames with one id also means a hand
      // edit reaching whichever the search finds first.
      if (animation.frames.some((frame) => frame.id === body.newFrameId)) return false;

      // Its own bytes, not the source's path. Sharing the file made the copy a
      // second name for one picture: an edit to either was written to a file
      // neither record pointed at, so it vanished — and deleting the source
      // took the copy's picture with it.
      const file = await copyFrameFile(paths, animation, source, body.newFrameId);
      const copy: FrameRecord = {
        ...source,
        id: body.newFrameId,
        file,
        provenance: { ...source.provenance, createdAt: Date.now() },
      };
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => {
        const at = current.frames.findIndex((frame) => frame.id === body.frameId);
        return {
          ...current,
          frames: [...current.frames.slice(0, at + 1), copy, ...current.frames.slice(at + 1)],
        };
      });
      return true;
    }

    case 'sprite.frame.delete': {
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        frames: current.frames.filter((frame) => frame.id !== body.frameId),
      }));
      return true;
    }

    case 'sprite.frame.reorder': {
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => {
        const byId = new Map(current.frames.map((frame) => [frame.id, frame]));
        const ordered = body.frameIds.flatMap((id) => {
          const frame = byId.get(id);
          return frame === undefined ? [] : [frame];
        });
        // Anything the request did not name keeps its place at the end rather
        // than disappearing: a reorder must never delete a frame.
        const named = new Set(body.frameIds);
        return {
          ...current,
          frames: [...ordered, ...current.frames.filter((frame) => !named.has(frame.id))],
        };
      });
      return true;
    }

    case 'sprite.frame.set-duration': {
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        frames: current.frames.map((frame) =>
          frame.id === body.frameId
            ? { ...frame, durationMs: Math.max(1, Math.round(body.durationMs)) }
            : frame,
        ),
      }));
      return true;
    }
  }
}

/**
 * A hand edit lands as an indexed PNG the page produced from the character's own
 * palette, so it cannot introduce a colour the character does not have — the one
 * thing the whole pipeline exists to prevent.
 */
async function writeHandEdit(
  paths: DesignLibraryPaths,
  animation: AnimationRecord,
  frameId: string,
  bytes: Buffer,
): Promise<void> {
  const file = path.join(
    animationDir(paths, animation.characterId, animation.id),
    'frames',
    `${frameId}.png`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
    ...current,
    frames: current.frames.map((frame) =>
      frame.id === frameId
        ? {
            ...frame,
            // The file this edit was actually written to. Leaving the old
            // pointer in place is how an edit to a duplicated frame
            // disappeared: the bytes went to `<frameId>.png` and the record
            // went on naming the frame it was copied from.
            file: relativeToHome(paths, file),
            provenance: { ...frame.provenance, kind: 'hand-edited', createdAt: Date.now() },
            findings: [],
          }
        : frame,
    ),
  }));
}

/** A duplicated frame's own copy of the picture. */
async function copyFrameFile(
  paths: DesignLibraryPaths,
  animation: AnimationRecord,
  source: FrameRecord,
  newFrameId: string,
): Promise<string> {
  const file = path.join(
    animationDir(paths, animation.characterId, animation.id),
    'frames',
    `${newFrameId}.png`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await copyFile(path.join(paths.home, source.file), file);
  return relativeToHome(paths, file);
}
