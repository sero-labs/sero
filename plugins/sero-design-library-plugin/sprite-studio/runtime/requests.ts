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
  setOpen,
} from './projection';
import { heldStagingKeys, openNextReview, releaseSamples, settleReview } from './review';
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

function newAnimation(
  characterId: string,
  animationId: string,
  plan: AnimationPlan,
  videoModel: string,
  batchId: string,
): AnimationRecord {
  const now = Date.now();
  return {
    id: animationId,
    characterId,
    plan,
    batchId,
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
      // Staged samples live beside the characters, not inside them, so
      // removing the character's directory does not reach them.
      for (const animation of await listAnimations(paths, body.characterId)) {
        await releaseSamples(paths, animation);
      }
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
      // One id for everything this request creates, so the review can wait for
      // the whole batch without having to guess which animations belong to it.
      // The first animation's id rather than a fresh one: the request log is
      // at-least-once, and a replay that reached only half the batch last time
      // has to brand the rest with the same value.
      const batchId = body.animations[0]?.animationId ?? body.characterId;
      for (const entry of body.animations) {
        if ((await readAnimation(paths, body.characterId, entry.animationId)) !== null) continue;
        await writeAnimation(
          paths,
          newAnimation(body.characterId, entry.animationId, entry.plan, body.videoModel, batchId),
        );
        queue.animate(body.characterId, entry.animationId);
      }
      await patchSettings(paths, { videoModel: body.videoModel });
      break;
    }

    case 'sprite.frames.attach': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      // Already past this point: a replayed attach must not propose a second
      // time over frames that have been chosen, or built.
      if (animation.status !== 'awaiting-frames') {
        // But a replay after the proposal landed names the very key the review
        // is holding open. Clearing it here would delete the samples out from
        // under a review nobody could then finish — and the request log is
        // at-least-once, so this replay is not hypothetical.
        //
        // Checked against **every** open review, not just this animation's:
        // this tool is reachable from any chat, so a body naming one animation
        // and another's staging key is untrusted input aimed at a delete.
        if (!(await heldStagingKeys(paths)).includes(body.stagingKey)) {
          await clearStaged(paths, body.stagingKey);
        }
        return;
      }
      queue.propose(animation.characterId, animation.id, body.stagingKey, body.durationsMs);
      return;
    }

    case 'sprite.frames.choose': {
      const animation = await findAnimation(paths, body.animationId);
      // Ignored unless a proposal is actually waiting. A replayed choose after
      // the build has started would read samples that have already been
      // cleared, and a second build is a second round of paid repairs.
      if (animation === null || animation.status !== 'awaiting-review') return;
      const review = animation.review;
      if (review === undefined) return;

      // Refused here and not only in the interface, because the interface is
      // not the only way in. One frame is a picture, not an animation.
      const chosen = [...new Set(body.indices)]
        .filter((index) => Number.isInteger(index) && index >= 0 && index < review.sampleCount)
        .toSorted((a, b) => a - b);
      if (chosen.length < 2) {
        throw new Error('An animation needs at least two frames, so nothing was built.');
      }

      // Claimed under the record lock before any work is queued, because the
      // guard above is not enough on its own: the status does not move until
      // the build job actually starts, so a double press — or a replay — would
      // pass it twice and pay for two rounds of repairs on one clip.
      let claimed = false;
      await mutateAnimation(paths, animation.characterId, animation.id, (current) => {
        if (current.status !== 'awaiting-review') return current;
        claimed = true;
        return { ...current, status: 'compiling' };
      });
      if (!claimed) return;

      queue.build(
        animation.characterId,
        animation.id,
        review.stagingKey,
        review.sampleDurationsMs,
        chosen,
      );
      // Straight on to the next proposal of the batch, so the whole review is
      // one pass rather than a trip back to the rail between each animation.
      await openNextReview(paths, animation);
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
      await settleReview(paths, animation);
      break;
    }

    case 'sprite.animation.delete': {
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      queue.cancelAnimation(body.animationId);
      // The staged samples live outside the animation's own directory, so
      // deleting the directory alone would leave them behind for an hour.
      await releaseSamples(paths, animation);
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
      // Resolved here rather than inside the job, so the queue knows whose work
      // this is and a purge can stop it.
      const animation = await findAnimation(paths, body.animationId);
      if (animation === null) return;
      queue.fix(animation.characterId, body.animationId, body.instruction, body.frameId);
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
      // A new clip is being paid for, so the old clip's samples and the
      // proposal made from them are finished with.
      await settleReview(paths, animation);
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
