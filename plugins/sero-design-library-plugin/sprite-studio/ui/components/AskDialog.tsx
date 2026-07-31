import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
  Textarea,
} from '@sero-ai/ui';
import { useMemo, useState } from 'react';

import type { AnimationPlan } from '../../shared/character';
import type { AnimationSummary } from '../../shared/state';
import { VIDEO_MODELS } from '../../shared/video-models';
import { useAnimationRecords } from '../hooks/useSpriteRecord';
import { Chip, Field } from './PanelParts';
import { PlanTable, type PlanRow } from './PlanTable';

/**
 * Plain words in, a plan back (spec §4).
 *
 * The video model is chosen **here, in the open**, not buried in settings. It
 * changes the result more than any other control, and the two measured models
 * fail in opposite directions — so each card carries what it does and what it
 * costs you, measured, rather than a recommendation (D29). The choice is
 * remembered for next time.
 */

export interface AskDialogProps {
  open: boolean;
  characterId: string;
  characterName: string;
  /** The character's animations, which is where a returned plan shows up. */
  animations: AnimationSummary[];
  videoModel: string;
  onOpenChange(open: boolean): void;
  onPlan(request: string, videoModel: string): void;
  onStart(videoModel: string, animations: { animationId: string; plan: AnimationPlan }[]): void;
}

export function AskDialog({
  open,
  characterId,
  characterName,
  animations,
  videoModel,
  onOpenChange,
  onPlan,
  onStart,
}: AskDialogProps) {
  const [request, setRequest] = useState('');
  const [model, setModel] = useState(videoModel);
  const [asked, setAsked] = useState(false);
  /** Edits made to the returned plan, by animation. */
  const [edits, setEdits] = useState<Record<string, Partial<AnimationPlan>>>({});

  const planned = useMemo(
    () => animations.filter((animation) => animation.status === 'planned'),
    [animations],
  );
  const plannedIds = useMemo(() => planned.map((animation) => animation.id), [planned]);
  const records = useAnimationRecords(characterId, plannedIds);

  const rows = useMemo<PlanRow[]>(
    () =>
      planned.flatMap((animation) => {
        const record = records.get(animation.id);
        if (record === undefined) return [];
        return [
          {
            animationId: animation.id,
            plan: { ...record.plan, ...edits[animation.id] },
            canvas: animation.canvas,
          },
        ];
      }),
    [planned, records, edits],
  );

  const waiting = asked && rows.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New animations for {characterName}</DialogTitle>
          <DialogDescription>
            Everything inherits the character&rsquo;s palette, size and foot line.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            rows={3}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Give me a resting loop, two different whip attacks, a jump and a death sequence. Play them at 30fps."
            aria-label="What you want"
          />

          <Field label="Video model">
            <div className="grid grid-cols-2 gap-2">
              {VIDEO_MODELS.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setModel(choice.id)}
                  aria-pressed={model === choice.id}
                  className={`flex flex-col gap-1 rounded-lg border p-3 text-left ${
                    model === choice.id
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border bg-background'
                  }`}
                >
                  <b className="text-sm font-medium">{choice.name}</b>
                  <span className="text-muted-foreground text-sm">{choice.strength}</span>
                  <span className="text-muted-foreground text-sm">{choice.cost}</span>
                </button>
              ))}
            </div>
          </Field>

          {waiting && (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Spinner className="size-4" />
              Working out what each animation needs.
            </div>
          )}

          {rows.length > 0 && (
            <>
              <PlanTable
                rows={rows}
                onChange={(animationId, patch) =>
                  setEdits((current) => ({
                    ...current,
                    [animationId]: { ...current[animationId], ...patch },
                  }))
                }
              />
              <p className="text-muted-foreground text-sm">
                A resting loop needs six drawings, not thirty — each one is held for several
                ticks. An attack needs a wider canvas because the reach goes past the body, and
                the feet stay on the same line in all of them.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Chip>Stops after each animation for your approval</Chip>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {rows.length === 0 ? (
              <Button
                type="button"
                disabled={request.trim() === '' || waiting}
                onClick={() => {
                  setAsked(true);
                  onPlan(request.trim(), model);
                }}
              >
                Plan it
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  onStart(
                    model,
                    rows.map((row) => ({ animationId: row.animationId, plan: row.plan })),
                  );
                  onOpenChange(false);
                }}
              >
                Start · {rows.length} animations
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
