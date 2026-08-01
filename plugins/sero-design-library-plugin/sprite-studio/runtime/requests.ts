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
import { readState, updateState } from '../../shared/state-io';
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
import { applyFrameRequest, isFrameRequest } from './requests-frames';
import {
  clearSpriteProblem,
  projectSpriteState,
  reportSpriteNotice,
  reportSpriteProblem,
} from './projection';
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

async function patchSettings(
  paths: DesignLibraryPaths,
  patch: Partial<SpriteStudioSettings>,
): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => ({
    ...current,
    sprite: { ...current.sprite, settings: { ...current.sprite.settings, ...patch } },
  }));
}

/**
 * What the page is looking at, said outright.
 *
 * Both keys are assigned from the request rather than skipped when absent, so
 * "the character sheet" is a different instruction from "leave it alone".
 * Omitting them made closing an animation impossible: the sheet opened, and
 * reopening the page landed back on the animation.
 */
export async function setOpen(
  paths: DesignLibraryPaths,
  open: { characterId?: string; animationId?: string },
): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => {
    const {
      openCharacterId: _character,
      openAnimationId: _animation,
      ...rest
    } = current.sprite;
    return {
      ...current,
      sprite: {
        ...rest,
        ...(open.characterId === undefined ? {} : { openCharacterId: open.characterId }),
        ...(open.animationId === undefined ? {} : { openAnimationId: open.animationId }),
      },
    };
  });
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

  // Frame edits are their own family and live in their own file. They report
  // whether anything changed, because half of them are no-ops against a frame
  // the user has since deleted.
  if (isFrameRequest(body)) {
    if (await applyFrameRequest(paths, body)) await projectSpriteState(paths);
    return;
  }

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
      await mutateCharacter(paths, body.characterId, (character) => ({
        ...character,
        favourite: body.favourite,
      }));
      break;
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

    case 'sprite.frames.failed': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null || animation.status !== 'awaiting-frames') return;
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => ({
        ...current,
        status: 'failed',
        error: `${body.reason} The clip is still on disk; running the sequence again will draw a new one.`,
      }));
      break;
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
        // Cleared here, not when the rebuild succeeds minutes later. The
        // workbench shows the failure before it shows the work, so leaving it
        // means "Run it again" looks like it did nothing — and the next press
        // is another paid clip.
        error: undefined,
      }));
      queue.animate(animation.characterId, animation.id);
      return;
    }

    case 'sprite.export': {
      queue.exportSheet(body.exportId, body.characterId, body.animationIds, body.options);
      return;
    }

    case 'sprite.settings.update': {
      await patchSettings(paths, body.patch);
      return;
    }

    case 'sprite.notice.dismiss': {
      await clearSpriteProblem(paths);
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
