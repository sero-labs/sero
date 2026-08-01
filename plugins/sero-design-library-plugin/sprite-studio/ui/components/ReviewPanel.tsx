import { Button, Textarea } from '@sero-ai/ui';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { AnimationSummary } from '../../shared/state';
import { useSpriteClip } from '../hooks/useSpriteAsset';
import { Crumbs, DetailPanel, Field } from './PanelParts';
import { SampleStrip } from './SampleStrip';

/**
 * The one screen between the clip and the sequence.
 *
 * Watching the take and choosing its frames are the same judgement — "is this
 * any good, and which parts of it do I want" — so they are one screen. Two
 * would ask the user to look at the same clip twice.
 *
 * It is also the cheapest refusal in the feature. Everything here is already on
 * disk, so rejecting a take at this point costs nothing and saves every repair
 * call and the judge run that would have followed. Both buttons that draw again
 * say that they are paying for a new clip.
 */

/** Fewer than this is a picture, not an animation. Refused at the runtime too. */
const LEAST_FRAMES = 2;

interface ReviewPanelProps {
  summary: AnimationSummary;
  review: NonNullable<AnimationSummary['review']>;
  characterName: string;
  /** What the clip was asked for, so the take can be judged against it. */
  instruction: string;
  onOpenShelf(): void;
  onOpenCharacter(): void;
  onChoose(indices: number[]): void;
  onRedo(instruction: string): void;
  onDiscard(): void;
}

export function ReviewPanel({
  summary,
  review,
  characterName,
  instruction: asked,
  onOpenShelf,
  onOpenCharacter,
  onChoose,
  onRedo,
  onDiscard,
}: ReviewPanelProps) {
  // Seeded from the proposal, held here. A toggle must move the strip now
  // rather than after a round trip, and nothing is decided until Use is pressed.
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set(review.proposed));
  const [instruction, setInstruction] = useState('');
  const clip = useSpriteClip(review.clipPath);
  const enough = chosen.size >= LEAST_FRAMES;

  const toggle = (index: number): void =>
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <Crumbs
          trail={[
            { label: 'Sprite Studio', onClick: onOpenShelf },
            { label: characterName, onClick: onOpenCharacter },
          ]}
          last={summary.name}
        />

        <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {clip === null ? (
              <p className="text-muted-foreground text-sm">Reading the clip.</p>
            ) : (
              // Muted and looping: this plays the moment the screen opens, and
              // a clip that made a noise every time would be unusable.
              // `h-full` rather than `max-h-full`: a 480p clip in a pane twice
              // its height would otherwise sit at its own small intrinsic size,
              // and this is the picture the take is being judged on.
              <video
                src={clip}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="h-full max-w-full rounded-md object-contain"
              />
            )}
          </div>
          <div className="border-border text-muted-foreground flex h-9 shrink-0 items-center gap-2 border-t px-3 text-sm">
            {chosen.size} of {review.sampleCount} chosen
            {review.loopWindow !== undefined && (
              <span className="ml-auto font-mono text-xs">
                the clip repeats from {review.loopWindow.from + 1} to {review.loopWindow.to + 1}
              </span>
            )}
          </div>
          <SampleStrip
            previewDir={review.previewDir}
            version={review.proposedAt}
            sampleCount={review.sampleCount}
            canvas={summary.canvas}
            chosen={chosen}
            {...(review.loopWindow === undefined ? {} : { loopWindow: review.loopWindow })}
            onToggle={toggle}
          />
        </div>
      </div>

      <DetailPanel
        eyebrow="Before it is built"
        title={summary.name}
        subtitle="Click a frame to keep it or drop it."
        footer={
          <>
            {/* Sorted here as well as in the runtime. Order is source order by
                decision, and a request that carried click order would be
                relying on the far side to know that. */}
            <Button
              type="button"
              disabled={!enough}
              onClick={() => onChoose([...chosen].toSorted((a, b) => a - b))}
            >
              {enough ? `Use these ${chosen.size} frames` : 'Keep at least two frames'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-amber-400"
              onClick={() => {
                onRedo(instruction.trim());
                setInstruction('');
              }}
            >
              <RotateCcw className="size-3.5" />
              {instruction.trim() === '' ? 'Draw it again' : 'Draw it again, changed'}
            </Button>
            <Button type="button" variant="ghost" className="text-destructive" onClick={onDiscard}>
              <Trash2 className="size-3.5" />
              Discard
            </Button>
          </>
        }
      >
        <Field label="What it was asked to do">
          {asked !== '' && <p className="text-sm leading-relaxed">{asked}</p>}
          <p className="text-muted-foreground text-sm leading-relaxed">
            These frames become the animation. Nothing else from the clip is kept.
          </p>
        </Field>

        <Field label="Draw it again">
          <Textarea
            rows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Optional. Slower, and keep the whip low."
          />
          {/* The one thing on this screen that spends money, said where the
              button is rather than in a note somewhere else. */}
          <p className="text-muted-foreground text-sm leading-relaxed">
            Drawing again buys a new clip at full price. Changing the frames costs nothing.
          </p>
        </Field>
      </DetailPanel>
    </div>
  );
}
