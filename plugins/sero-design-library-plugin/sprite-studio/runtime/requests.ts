/**
 * Applying Sprite Studio's intent.
 *
 * The runtime is the single authoritative writer, as it is for the rest of the
 * plugin: the page appends a request and this applies it. Every handler is
 * idempotent, because the request log is at-least-once — a crash between
 * applying a request and recording it replays that one request, and a replay
 * must not produce a second character or a second paid-for clip.
 *
 * A request naming something that no longer exists is a no-op rather than an
 * error. Intent is submitted asynchronously and the world may have moved on.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { itemDir, type DesignLibraryPaths } from '../../shared/paths';
import { readItem } from '../../runtime/store';
import { updateState } from '../../shared/state-io';
import type { DesignLibraryState } from '../../shared/types';
import type {
  AnimationPlan,
  AnimationRecord,
  CharacterRecord,
  FrameRecord,
} from '../shared/character';
import type {
  AnimationSummary,
  CharacterSummary,
  SpriteRequestBody,
  SpriteStudioSettings,
} from '../shared/state';
import { animationDir } from '../shared/paths';
import { applyPaletteCap, ingestCharacter, remeasure } from './ingest';
import { clearStaged, readStaged } from './staging';
import {
  animationSummary,
  characterSummary,
  destroyAnimation,
  destroyCharacter,
  findAnimation,
  listAnimations,
  listCharacters,
  mutateAnimation,
  mutateCharacter,
  readAnimation,
  readCharacter,
  writeAnimation,
} from './store';
import type { SpriteQueue } from './queue';

export interface SpriteRequestContext {
  paths: DesignLibraryPaths;
  queue: SpriteQueue;
  onError(message: string, error: unknown): void;
}

export function isSpriteBody(body: { kind: string }): body is SpriteRequestBody {
  return body.kind.startsWith('sprite.');
}

/**
 * Forget the last problem.
 *
 * Called when a request succeeds, because a notice that outlives the fault it
 * describes is worse than none: it says something is broken while the thing it
 * complained about is working.
 */
export async function clearSpriteProblem(paths: DesignLibraryPaths): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => {
    if (current.sprite.notice === undefined) return null;
    const { notice: _dropped, ...sprite } = current.sprite;
    return { ...current, sprite };
  });
}

/** Rebuild the whole slice from the records. Cheap, and always correct. */
export async function projectSpriteState(paths: DesignLibraryPaths): Promise<void> {
  const characters = await listCharacters(paths);
  const summaries: CharacterSummary[] = [];
  const animations: AnimationSummary[] = [];
  for (const character of characters) {
    const owned = await listAnimations(paths, character.id);
    summaries.push(characterSummary(character, owned, false));
    for (const animation of owned) {
      if (animation.deletedAt !== undefined) continue;
      animations.push(animationSummary(animation));
    }
  }
  await updateState(paths, (current: DesignLibraryState) => ({
    ...current,
    sprite: { ...current.sprite, characters: summaries, animations },
  }));
}

/**
 * Say what went wrong, where the user can see it.
 *
 * A request is applied in the background, so a refusal has nowhere to appear on
 * its own: the page asks, the runtime throws, the watermark advances and the
 * button looks broken. This is the only reason the notice exists.
 */
export async function reportSpriteProblem(
  paths: DesignLibraryPaths,
  message: string,
): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => ({
    ...current,
    sprite: { ...current.sprite, notice: { message, at: Date.now() } },
  }));
}

async function patchSettings(
  paths: DesignLibraryPaths,
  patch: Partial<SpriteStudioSettings>,
): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => ({
    ...current,
    sprite: { ...current.sprite, settings: { ...current.sprite.settings, ...patch } },
  }));
}

async function setOpen(
  paths: DesignLibraryPaths,
  open: { characterId?: string; animationId?: string },
): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => ({
    ...current,
    sprite: {
      ...current.sprite,
      ...(open.characterId === undefined ? {} : { openCharacterId: open.characterId }),
      ...(open.animationId === undefined ? {} : { openAnimationId: open.animationId }),
    },
  }));
}

function newAnimation(
  characterId: string,
  animationId: string,
  plan: AnimationPlan,
  videoModel: string,
): AnimationRecord {
  const now = Date.now();
  return {
    id: animationId,
    characterId,
    plan,
    status: 'planned',
    canvas: { cols: 0, rows: 0 },
    anchor: { col: 0, row: 0 },
    frames: [],
    findings: [],
    report: null,
    videoModel,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function applySpriteRequest(
  body: SpriteRequestBody,
  context: SpriteRequestContext,
): Promise<void> {
  const { paths, queue } = context;

  switch (body.kind) {
    case 'sprite.character.create': {
      // Idempotent by id: a replay finds the character already there and stops.
      if ((await readCharacter(paths, body.characterId)) !== null) return;
      const file = (await readStaged(paths, body.stagingKey))[0];
      if (file === undefined) {
        throw new Error('The picture never finished uploading, so there is nothing to measure.');
      }
      await ingestCharacter(paths, {
        characterId: body.characterId,
        name: body.name,
        source: 'reference',
        bytes: file.bytes,
        fileName: file.name,
      });
      await clearStaged(paths, body.stagingKey);
      await setOpen(paths, { characterId: body.characterId });
      break;
    }

    case 'sprite.character.create-from-item': {
      if ((await readCharacter(paths, body.characterId)) !== null) return;
      await ingestCharacter(paths, {
        characterId: body.characterId,
        name: body.name,
        source: 'library-item',
        bytes: await readFile(await libraryItemFile(paths, body)),
        fileName: 'reference.png',
      });
      await setOpen(paths, { characterId: body.characterId });
      break;
    }

    case 'sprite.character.create-from-text': {
      if ((await readCharacter(paths, body.characterId)) !== null) return;
      // Drawing the character first is a provider call, so it goes through the
      // queue with everything else that costs money.
      queue.drawCharacter(body.characterId, body.name, body.description);
      break;
    }

    case 'sprite.character.re-measure': {
      await remeasure(paths, body.characterId);
      break;
    }

    case 'sprite.character.set-cap': {
      await applyPaletteCap(paths, body.characterId, body.cap);
      break;
    }

    case 'sprite.character.rename': {
      await mutateCharacter(paths, body.characterId, (character) => ({
        ...character,
        name: body.name.trim().slice(0, 64),
      }));
      break;
    }

    case 'sprite.character.set-export-scale': {
      // Whole numbers only, or the pixels blur (D3). The page offers whole
      // numbers, and this is where a request that came from anywhere else is
      // made to obey the same rule.
      const scale = Math.max(1, Math.round(body.scale));
      await mutateCharacter(paths, body.characterId, (character) => ({
        ...character,
        exportScale: scale,
      }));
      break;
    }

    case 'sprite.character.set-style-notes': {
      await mutateCharacter(paths, body.characterId, (character) => ({
        ...character,
        styleNotes: body.notes.trim().slice(0, 2000),
      }));
      break;
    }

    case 'sprite.character.approve': {
      await mutateCharacter(paths, body.characterId, (character) => ({
        ...character,
        status: 'approved',
      }));
      break;
    }

    case 'sprite.character.favourite': {
      await updateState(paths, (current: DesignLibraryState) => ({
        ...current,
        sprite: {
          ...current.sprite,
          characters: current.sprite.characters.map((character) =>
            character.id === body.characterId
              ? { ...character, favourite: body.favourite }
              : character,
          ),
        },
      }));
      return;
    }

    case 'sprite.character.delete':
    case 'sprite.character.restore': {
      await mutateCharacter(paths, body.characterId, (character) => ({
        ...character,
        ...(body.kind === 'sprite.character.delete'
          ? { deletedAt: Date.now() }
          : { deletedAt: undefined }),
      }));
      break;
    }

    case 'sprite.character.purge': {
      queue.cancelCharacter(body.characterId);
      await destroyCharacter(paths, body.characterId);
      break;
    }

    case 'sprite.plan': {
      queue.plan(body.characterId, body.planId, body.request, body.videoModel);
      return;
    }

    case 'sprite.generate': {
      const character = await readCharacter(paths, body.characterId);
      // Nothing is generated until the character sheet is approved (D5). A
      // request that arrives anyway is refused rather than quietly obeyed.
      if (character === null || character.status !== 'approved') {
        throw new Error(
          'This character has not been approved yet, so nothing can be generated from it.',
        );
      }
      for (const entry of body.animations) {
        if ((await readAnimation(paths, body.characterId, entry.animationId)) !== null) continue;
        await writeAnimation(
          paths,
          newAnimation(body.characterId, entry.animationId, entry.plan, body.videoModel),
        );
        queue.animate(body.characterId, entry.animationId);
      }
      await patchSettings(paths, { videoModel: body.videoModel });
      break;
    }

    case 'sprite.frames.attach': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      // Already built: a replayed attach must not spend a second round of
      // repairs on frames that are finished.
      if (animation.status !== 'awaiting-frames') {
        await clearStaged(paths, body.stagingKey);
        return;
      }
      queue.build(animation.characterId, animation.id, body.stagingKey, body.durationsMs);
      return;
    }

    case 'sprite.animation.approve': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        status: 'approved',
        approvedAt: Date.now(),
      }));
      break;
    }

    case 'sprite.animation.cancel': {
      queue.cancelAnimation(body.animationId);
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        status: 'failed',
        error: 'Cancelled.',
      }));
      break;
    }

    case 'sprite.animation.delete': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      queue.cancelAnimation(body.animationId);
      await destroyAnimation(paths, animation.characterId, animation.id);
      break;
    }

    case 'sprite.animation.set-loop':
    case 'sprite.animation.set-play-rate':
    case 'sprite.animation.rename': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        plan: {
          ...current.plan,
          ...(body.kind === 'sprite.animation.set-loop' ? { loop: body.loop } : {}),
          ...(body.kind === 'sprite.animation.set-play-rate'
            ? { playRate: Math.min(60, Math.max(1, Math.round(body.playRate))) }
            : {}),
          ...(body.kind === 'sprite.animation.rename'
            ? { name: body.name.trim().slice(0, 48) }
            : {}),
        },
      }));
      break;
    }

    case 'sprite.fix': {
      queue.fix(body.animationId, body.instruction, body.frameId);
      return;
    }

    case 'sprite.animation.redo': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      // Append rather than replace: the previous version survives, so a redo
      // that comes back worse is recoverable (D18).
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        status: 'planned',
        plan: { ...current.plan, instruction: body.instruction || current.plan.instruction },
        history: [
          ...current.history,
          {
            id: randomUUID(),
            reason: body.instruction === '' ? 'Redone' : body.instruction,
            frames: current.frames,
            report: current.report,
            createdAt: Date.now(),
          },
        ],
        frames: [],
        findings: [],
        report: null,
      }));
      queue.animate(animation.characterId, animation.id);
      return;
    }

    case 'sprite.frame.write': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      const staged = await readStaged(paths, body.stagingKey);
      const file = staged[0];
      if (file === undefined) return;
      await writeHandEdit(paths, animation, body.frameId, file.bytes);
      await clearStaged(paths, body.stagingKey);
      break;
    }

    case 'sprite.frame.duplicate': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      const source = animation.frames.find((frame) => frame.id === body.frameId);
      if (source === undefined) return;
      const copy: FrameRecord = {
        ...source,
        id: body.newFrameId,
        provenance: { ...source.provenance, createdAt: Date.now() },
      };
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => {
        const at = current.frames.findIndex((frame) => frame.id === body.frameId);
        return {
          ...current,
          frames: [...current.frames.slice(0, at + 1), copy, ...current.frames.slice(at + 1)],
        };
      });
      break;
    }

    case 'sprite.frame.delete': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        frames: current.frames.filter((frame) => frame.id !== body.frameId),
      }));
      break;
    }

    case 'sprite.frame.reorder': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
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
      break;
    }

    case 'sprite.frame.set-duration': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        frames: current.frames.map((frame) =>
          frame.id === body.frameId
            ? { ...frame, durationMs: Math.max(1, Math.round(body.durationMs)) }
            : frame,
        ),
      }));
      break;
    }

    case 'sprite.export': {
      queue.exportSheet(body.exportId, body.characterId, body.animationIds, body.options);
      return;
    }

    case 'sprite.settings.update': {
      await patchSettings(paths, body.patch);
      return;
    }

    case 'sprite.open': {
      await setOpen(paths, {
        ...(body.characterId === undefined ? {} : { characterId: body.characterId }),
        ...(body.animationId === undefined ? {} : { animationId: body.animationId }),
      });
      return;
    }
  }

  await projectSpriteState(paths);
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
  const file = path.join(animationDir(paths, animation.characterId, animation.id), 'frames', `${frameId}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
    ...current,
    frames: current.frames.map((frame) =>
      frame.id === frameId
        ? {
            ...frame,
            provenance: { ...frame.provenance, kind: 'hand-edited', createdAt: Date.now() },
            findings: [],
          }
        : frame,
    ),
  }));
}

/**
 * The picture behind a Library item.
 *
 * The original rather than the preview: the preview is a re-encoded thumbnail,
 * and measuring the art grid on one would find the grid of the thumbnail rather
 * than the grid of the artwork.
 */
async function libraryItemFile(
  paths: DesignLibraryPaths,
  body: Extract<SpriteRequestBody, { kind: 'sprite.character.create-from-item' }>,
): Promise<string> {
  const item = await readItem(paths, body.itemId);
  if (item === null) throw new Error('That Library item no longer exists.');
  return path.join(itemDir(paths, body.itemId), item.asset.originalFile);
}

export type { CharacterRecord };
