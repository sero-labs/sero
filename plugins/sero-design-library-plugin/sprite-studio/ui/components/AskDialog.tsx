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
import type { PlanResult } from '../../shared/state';
import { VIDEO_MODELS } from '../../shared/video-models';
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
  characterName: string;
  /**
   * Plans the runtime has written back, by the id the page allocated.
   *
   * A plan is **not** an animation. Nothing exists on disk until the user
   * accepts it and presses Start, which is the whole reason planning is a step
   * of its own: the frame counts, the rates and the canvases are all changeable
   * before a penny is spent.
   */
  plans: Record<string, PlanResult>;
  videoModel: string;
  onOpenChange(open: boolean): void;
  /** Returns the id to watch for this plan's answer. */
  onPlan(request: string, videoModel: string): Promise<string>;
  onStart(videoModel: string, animations: { animationId: string; plan: AnimationPlan }[]): void;
}

export function AskDialog({
  open,
  characterName,
  plans,
  videoModel,
  onOpenChange,
  onPlan,
  onStart,
}: AskDialogProps) {
  const [request, setRequest] = useState('');
  const [model, setModel] = useState(videoModel);
  const [planId, setPlanId] = useState<string | null>(null);
  /** Edits made to the returned plan, by position in it. */
  const [edits, setEdits] = useState<Record<string, Partial<AnimationPlan>>>({});

  const result = planId === null ? undefined : plans[planId];

  const rows = useMemo<PlanRow[]>(
    () =>
      result?.status !== 'ok'
        ? []
        : result.animations.map((plan, index) => ({
            // The id the animation will be created under when Start is pressed.
            // Allocated here so an edit can be addressed before anything exists.
            animationId: `anim-${planId ?? ''}-${index}`,
            plan: { ...plan, ...edits[String(index)] },
          })),
    [result, planId, edits],
  );

  const waiting = planId !== null && result === undefined;
  const failed = result?.status === 'ok' ? undefined : result?.reason;

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

          {failed !== undefined && failed !== '' && (
            <p className="text-destructive py-4 text-sm">{failed}</p>
          )}

          {rows.length > 0 && (
            <>
              <PlanTable
                rows={rows}
                onChange={(animationId, patch) => {
                  const index = String(rows.findIndex((row) => row.animationId === animationId));
                  setEdits((current) => ({ ...current, [index]: { ...current[index], ...patch } }));
                }}
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
                  void onPlan(request.trim(), model).then(setPlanId);
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
