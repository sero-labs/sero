import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useMemo, useState } from 'react';

import type { DesignLibraryState } from '../../../shared/types';
import { DEFAULT_STATE } from '../../../shared/types';
import type { AnimationPlan, LoopMode, PaletteCap } from '../../shared/character';
import type {
  AnimationSummary,
  CharacterSummary,
  SpriteExportOptions,
  SpriteRequestBody,
  SpriteStudioSettings,
} from '../../shared/state';
import { newSpriteId, sendRequest, stageFile, toPngBytes } from '../lib/requests';

/**
 * One place Sprite Studio reads state and asks for changes.
 *
 * Every change is a request. The runtime is the single writer, so nothing here
 * waits for a result and nothing here writes state — a character appears on the
 * shelf when the runtime says it has one, which is also when it is true.
 *
 * The one exception is which character and animation are open. That is held
 * locally as well, because a rail click must move the page now rather than
 * after a round trip, and it is dropped the moment state reports an answer.
 */

export interface SpriteStudio {
  characters: CharacterSummary[];
  /** The last thing that went wrong, so a refused request is visible. */
  notice: { message: string; at: number } | undefined;
  animations: AnimationSummary[];
  settings: SpriteStudioSettings;
  openCharacter: CharacterSummary | undefined;
  openAnimation: AnimationSummary | undefined;
  /** Live animations of the open character, in the order they were made. */
  openAnimations: AnimationSummary[];
  /** Library images a character can be made from. */
  libraryImages: { id: string; title: string }[];
  actions: SpriteActions;
}

export interface SpriteActions {
  open(characterId: string | undefined, animationId?: string): void;
  createFromFile(name: string, file: File): Promise<void>;
  createFromText(name: string, description: string): Promise<void>;
  createFromItem(name: string, itemId: string): Promise<void>;
  reMeasure(characterId: string): Promise<void>;
  setCap(characterId: string, cap: PaletteCap): Promise<void>;
  renameCharacter(characterId: string, name: string): Promise<void>;
  setExportScale(characterId: string, scale: number): Promise<void>;
  setStyleNotes(characterId: string, notes: string): Promise<void>;
  approveCharacter(characterId: string): Promise<void>;
  favourite(characterId: string, favourite: boolean): Promise<void>;
  deleteCharacter(characterId: string): Promise<void>;
  restoreCharacter(characterId: string): Promise<void>;
  purgeCharacter(characterId: string): Promise<void>;
  /** Ask for a plan. The id comes back so the dialog can watch for its answer. */
  plan(characterId: string, request: string, videoModel: string): Promise<string>;
  generate(
    characterId: string,
    videoModel: string,
    animations: { animationId: string; plan: AnimationPlan }[],
  ): Promise<void>;
  approveAnimation(animationId: string): Promise<void>;
  cancelAnimation(animationId: string): Promise<void>;
  deleteAnimation(animationId: string): Promise<void>;
  setLoop(animationId: string, loop: LoopMode): Promise<void>;
  setPlayRate(animationId: string, playRate: number): Promise<void>;
  renameAnimation(animationId: string, name: string): Promise<void>;
  /** Ask the AI to fix a frame, or the whole animation (D18). */
  fix(animationId: string, instruction: string, frameId?: string): Promise<void>;
  redoAnimation(animationId: string, instruction: string): Promise<void>;
  duplicateFrame(animationId: string, frameId: string): Promise<void>;
  deleteFrame(animationId: string, frameId: string): Promise<void>;
  reorderFrames(animationId: string, frameIds: string[]): Promise<void>;
  setFrameDuration(animationId: string, frameId: string, durationMs: number): Promise<void>;
  exportSheet(
    characterId: string,
    animationIds: string[],
    options: SpriteExportOptions,
  ): Promise<void>;
  updateSettings(patch: Partial<SpriteStudioSettings>): Promise<void>;
}

interface OpenIds {
  characterId: string | undefined;
  animationId: string | undefined;
}

export function useSpriteStudio(): SpriteStudio {
  const [state] = useAppState<DesignLibraryState>(DEFAULT_STATE);
  const tools = useAppTools();
  const sprite = state.sprite;

  // Local selection leads; the persisted copy follows. Retired the moment state
  // reports a different answer — whether that is ours coming back or the
  // runtime opening something new after an ingestion.
  const [localOpen, setLocalOpen] = useState<OpenIds | null>(null);
  const signature = `${sprite.openCharacterId ?? ''}|${sprite.openAnimationId ?? ''}`;
  const [acknowledged, setAcknowledged] = useState(signature);
  if (signature !== acknowledged) {
    setAcknowledged(signature);
    setLocalOpen(null);
  }

  const open: OpenIds = localOpen ?? {
    characterId: sprite.openCharacterId,
    animationId: sprite.openAnimationId,
  };

  const send = useCallback(
    async (body: SpriteRequestBody) => {
      await sendRequest(tools, body);
    },
    [tools],
  );

  const actions = useMemo<SpriteActions>(
    () => ({
      open: (characterId, animationId) => {
        setLocalOpen({ characterId, animationId });
        void send({
          kind: 'sprite.open',
          ...(characterId === undefined ? {} : { characterId }),
          ...(animationId === undefined ? {} : { animationId }),
        });
      },

      createFromFile: async (name, file) => {
        const characterId = newSpriteId('char');
        const stagingKey = newSpriteId('ref');
        // Converted here rather than sent as it came: the runtime reads PNG and
        // nothing else, and the codecs live in this process.
        await stageFile(tools, stagingKey, '000', await toPngBytes(file));
        await send({ kind: 'sprite.character.create', characterId, name, stagingKey });
      },
      createFromText: (name, description) =>
        send({
          kind: 'sprite.character.create-from-text',
          characterId: newSpriteId('char'),
          name,
          description,
        }),
      createFromItem: (name, itemId) =>
        send({
          kind: 'sprite.character.create-from-item',
          characterId: newSpriteId('char'),
          name,
          itemId,
        }),

      reMeasure: (characterId) => send({ kind: 'sprite.character.re-measure', characterId }),
      setCap: (characterId, cap) => send({ kind: 'sprite.character.set-cap', characterId, cap }),
      renameCharacter: (characterId, name) =>
        send({ kind: 'sprite.character.rename', characterId, name }),
      setExportScale: (characterId, scale) =>
        send({ kind: 'sprite.character.set-export-scale', characterId, scale }),
      setStyleNotes: (characterId, notes) =>
        send({ kind: 'sprite.character.set-style-notes', characterId, notes }),
      approveCharacter: (characterId) => send({ kind: 'sprite.character.approve', characterId }),
      favourite: (characterId, favourite) =>
        send({ kind: 'sprite.character.favourite', characterId, favourite }),
      deleteCharacter: (characterId) => send({ kind: 'sprite.character.delete', characterId }),
      restoreCharacter: (characterId) => send({ kind: 'sprite.character.restore', characterId }),
      purgeCharacter: (characterId) => send({ kind: 'sprite.character.purge', characterId }),

      plan: async (characterId, request, videoModel) => {
        const planId = newSpriteId('plan');
        await send({ kind: 'sprite.plan', characterId, planId, request, videoModel });
        return planId;
      },
      generate: (characterId, videoModel, animations) =>
        send({ kind: 'sprite.generate', characterId, videoModel, animations }),

      approveAnimation: (animationId) => send({ kind: 'sprite.animation.approve', animationId }),
      cancelAnimation: (animationId) => send({ kind: 'sprite.animation.cancel', animationId }),
      deleteAnimation: (animationId) => send({ kind: 'sprite.animation.delete', animationId }),
      setLoop: (animationId, loop) => send({ kind: 'sprite.animation.set-loop', animationId, loop }),
      setPlayRate: (animationId, playRate) =>
        send({ kind: 'sprite.animation.set-play-rate', animationId, playRate }),
      renameAnimation: (animationId, name) =>
        send({ kind: 'sprite.animation.rename', animationId, name }),

      fix: (animationId, instruction, frameId) =>
        send({
          kind: 'sprite.fix',
          animationId,
          instruction,
          ...(frameId === undefined ? {} : { frameId }),
        }),
      redoAnimation: (animationId, instruction) =>
        send({ kind: 'sprite.animation.redo', animationId, instruction }),

      duplicateFrame: (animationId, frameId) =>
        send({
          kind: 'sprite.frame.duplicate',
          animationId,
          frameId,
          newFrameId: newSpriteId('frame'),
        }),
      deleteFrame: (animationId, frameId) =>
        send({ kind: 'sprite.frame.delete', animationId, frameId }),
      reorderFrames: (animationId, frameIds) =>
        send({ kind: 'sprite.frame.reorder', animationId, frameIds }),
      setFrameDuration: (animationId, frameId, durationMs) =>
        send({ kind: 'sprite.frame.set-duration', animationId, frameId, durationMs }),

      exportSheet: (characterId, animationIds, options) =>
        send({
          kind: 'sprite.export',
          exportId: newSpriteId('export'),
          characterId,
          animationIds,
          options,
        }),
      updateSettings: (patch) => send({ kind: 'sprite.settings.update', patch }),
    }),
    [send, tools],
  );

  const characters = useMemo(
    () => sprite.characters.filter((character) => character.deletedAt === undefined),
    [sprite.characters],
  );
  const openCharacter = characters.find((character) => character.id === open.characterId);
  const openAnimations = useMemo(
    () => sprite.animations.filter((animation) => animation.characterId === open.characterId),
    [sprite.animations, open.characterId],
  );
  const openAnimation = openAnimations.find((animation) => animation.id === open.animationId);
  const libraryImages = useMemo(
    () =>
      state.items.flatMap((item) =>
        item.deletedAt === undefined && item.kind === 'image'
          ? [{ id: item.id, title: item.title }]
          : [],
      ),
    [state.items],
  );

  return {
    notice: sprite.notice,
    characters,
    animations: sprite.animations,
    settings: sprite.settings,
    openCharacter,
    openAnimation,
    openAnimations,
    libraryImages,
    actions,
  };
}
