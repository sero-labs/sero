import { useAppTools } from '@sero-ai/app-runtime';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ClipFramesTarget } from './lib/clip-frames';
import type { SpriteExportOptions } from '../shared/state';
import { AnimationCheckpoint } from './components/AnimationCheckpoint';
import { AnimationWorkbench } from './components/AnimationWorkbench';
import { AskDialog } from './components/AskDialog';
import { CharacterRail } from './components/CharacterRail';
import { CharacterSheet } from './components/CharacterSheet';
import { CharacterShelf } from './components/CharacterShelf';
import { ExportPage } from './components/ExportPage';
import { NewCharacterDialog } from './components/NewCharacterDialog';
import { useClipFrames } from './hooks/useClipFrames';
import { useAnimationRecord, useCharacterRecord } from './hooks/useSpriteRecord';
import { useSpriteStudio } from './hooks/useSpriteStudio';
import { writeFrameGrid } from './lib/pixel-edit';

/**
 * Sprite Studio.
 *
 * A character, or a picture of one, turned into finished sprite sheets. Two
 * checkpoints stop the work for the user — the character sheet, then each
 * animation as it lands — and everything between them is the runtime's.
 *
 * The page holds no records. It reads summaries from state, fetches the record
 * a screen needs, and every change it makes is a request.
 */

export function SpriteStudioPage() {
  const studio = useSpriteStudio();
  const tools = useAppTools();
  const { actions, openCharacter, openAnimation, openAnimations } = studio;

  const [creating, setCreating] = useState(false);
  const [asking, setAsking] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** Set when the user chose to work on a finished sequence rather than rule on it. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const character = useCharacterRecord(openCharacter?.id, openCharacter?.updatedAt);
  const animation = useAnimationRecord(
    openCharacter?.id,
    openAnimation?.id,
    openAnimation?.updatedAt,
  );

  // A clip the runtime cannot decode is the open page's job, wherever the user
  // happens to be — so this is watched here rather than on the workbench.
  const awaiting = useMemo<ClipFramesTarget[]>(
    () =>
      studio.animations.flatMap((summary) =>
        summary.awaitingFrames === undefined
          ? []
          : [{ animationId: summary.id, ...summary.awaitingFrames }],
      ),
    [studio.animations],
  );
  useClipFrames(awaiting);

  if (openCharacter === undefined) {
    return (
      <>
        <CharacterShelf
          characters={studio.characters}
          animations={studio.animations}
          openCharacterId={undefined}
          onOpen={(characterId) => actions.open(characterId)}
          onFavourite={(characterId, favourite) => void actions.favourite(characterId, favourite)}
          onNew={() => setCreating(true)}
        />
        <NewCharacterDialog
          open={creating}
          libraryImages={studio.libraryImages}
          onOpenChange={setCreating}
          onCreateFromFile={(name, file) => void actions.createFromFile(name, file)}
          onCreateFromText={(name, description) => void actions.createFromText(name, description)}
          onCreateFromItem={(name, itemId) => void actions.createFromItem(name, itemId)}
        />
      </>
    );
  }

  if (exporting && character !== null) {
    return (
      <ExportPage
        character={character}
        animations={openAnimations.filter((one) => one.frameCount > 0)}
        onBack={() => setExporting(false)}
        onExport={(animationIds, options: SpriteExportOptions) => {
          void actions.exportSheet(character.id, animationIds, options);
          setExporting(false);
        }}
      />
    );
  }

  const characterId = openCharacter.id;
  const approved = openCharacter.status === 'approved';
  // A finished sequence opens on its checkpoint, unless the user asked to work
  // on its frames instead.
  const atCheckpoint =
    openAnimation?.status === 'ready' && editingId !== openAnimation.id && animation !== null;

  // The one this approval moves on to: the next unapproved animation *after*
  // this one, so a batch is ruled on in the order it was asked for.
  const nextName = openAnimations
    .slice(openAnimations.findIndex((one) => one.id === openAnimation?.id) + 1)
    .find((one) => one.approvedAt === undefined)?.name;

  const rail = approved && (
    <CharacterRail
      characterName={openCharacter.name}
      animations={openAnimations}
      openAnimationId={openAnimation?.id}
      onOpenSheet={() => actions.open(characterId)}
      onOpenAnimation={(animationId) => {
        setEditingId(null);
        actions.open(characterId, animationId);
      }}
      onAddAnimations={() => setAsking(true)}
    />
  );

  const surface =
    openAnimation !== undefined ? (
      atCheckpoint && animation !== null && character !== null ? (
        <AnimationCheckpoint
          animation={animation}
          characterName={openCharacter.name}
          paletteSize={character.palette.length}
          nextName={nextName}
          working={openAnimation.progress}
          onApprove={() => void actions.approveAnimation(openAnimation.id)}
          onFix={(instruction) => void actions.fix(openAnimation.id, instruction)}
          onEditFrames={() => setEditingId(openAnimation.id)}
          onRedo={(instruction) => void actions.redoAnimation(openAnimation.id, instruction)}
        />
      ) : (
        <AnimationWorkbench
          summary={openAnimation}
          record={animation}
          characterName={openCharacter.name}
          actions={{
            setLoop: (loop) => void actions.setLoop(openAnimation.id, loop),
            setPlayRate: (playRate) => void actions.setPlayRate(openAnimation.id, playRate),
            fix: (instruction, frameId) =>
              void actions.fix(openAnimation.id, instruction, frameId),
            duplicateFrame: (frameId) => void actions.duplicateFrame(openAnimation.id, frameId),
            deleteFrame: (frameId) => void actions.deleteFrame(openAnimation.id, frameId),
            writeFrame: (frameId, grid, palette) =>
              void writeFrameGrid(tools, openAnimation.id, frameId, grid, palette),
            redo: (instruction) => void actions.redoAnimation(openAnimation.id, instruction),
            setFrameDuration: (frameId, durationMs) =>
              void actions.setFrameDuration(openAnimation.id, frameId, durationMs),
            cancel: () => void actions.cancelAnimation(openAnimation.id),
            remove: () => {
              void actions.deleteAnimation(openAnimation.id);
              // Back to the character sheet: the screen it was showing has just
              // been deleted, and leaving it up is a page about nothing.
              actions.open(characterId);
            },
            addAnimations: () => setAsking(true),
            exportSheet: () => setExporting(true),
          }}
        />
      )
    ) : character === null ? (
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center text-sm">
        Reading the character sheet.
      </div>
    ) : (
      <CharacterSheet
        character={character}
        onSetCap={(cap) => void actions.setCap(characterId, cap)}
        onSetExportScale={(scale) => void actions.setExportScale(characterId, scale)}
        onSetStyleNotes={(notes) => void actions.setStyleNotes(characterId, notes)}
        onApprove={() => void actions.approveCharacter(characterId)}
        onAddAnimations={() => setAsking(true)}
        onReMeasure={() => void actions.reMeasure(characterId)}
        onDiscard={() => {
          void actions.deleteCharacter(characterId);
          actions.open(undefined);
        }}
      />
    );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {/*
          Requests are applied in the background, so a refusal has nowhere else
          to appear. Without this the page shows a button that does nothing and
          the reason lives only in a log file.
        */}
        {studio.notice !== undefined && (
          <div
            role="alert"
            className={`flex items-start gap-2 border-b px-4 py-2 text-sm ${
              studio.notice.tone === 'done'
                ? 'border-border bg-muted/40 text-muted-foreground'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            }`}
          >
            <span className="min-w-0 flex-1">{studio.notice.message}</span>
            <button
              type="button"
              className="shrink-0 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              onClick={() => void actions.dismissNotice()}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {rail}
          {surface}
        </div>
      </div>
      {asking && (
        <AskDialog
          open
          characterName={openCharacter.name}
          plans={studio.plans}
          videoModel={studio.settings.videoModel}
          onOpenChange={setAsking}
          onPlan={(request, videoModel) => actions.plan(characterId, request, videoModel)}
          onStart={(videoModel, animations) => {
            void actions.generate(characterId, videoModel, animations);
            void actions.updateSettings({ videoModel });
          }}
        />
      )}
    </>
  );
}

export default SpriteStudioPage;
