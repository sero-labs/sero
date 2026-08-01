import { Button, Input, Textarea } from '@sero-ai/ui';
import { Pencil, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { AnimationRecord } from '../../shared/character';
import { ticksOf } from '../lib/playback';
import { DetailPanel, Field, Measure } from './PanelParts';
import { SpritePixels, fitScale } from './SpritePixels';
import { useBackdrop } from '../backdrop';

/**
 * The selected frame, and the way in to both kinds of fixing (D18).
 *
 * Paint it yourself, or tell the AI what is wrong. **Both are offered on every
 * frame**, whether or not the checks passed: a frame can pass every measurement
 * and still be wrong to the eye, and no measurement will ever raise it. The
 * instruction is optional — saying nothing and letting the model work it out
 * from the sequence is a legitimate way to ask.
 */

const THUMB = { width: 76, height: 66 };

interface FramePanelProps {
  animation: AnimationRecord;
  index: number;
  onEditPixels(): void;
  onFix(instruction: string): void;
  onDuplicate(): void;
  onDelete(): void;
  onSetDuration(durationMs: number): void;
}

export function FramePanel({
  animation,
  index,
  onEditPixels,
  onFix,
  onDuplicate,
  onDelete,
  onSetDuration,
}: FramePanelProps) {
  const backdrop = useBackdrop();
  const [instruction, setInstruction] = useState('');
  const frame = animation.frames[index];
  if (frame === undefined) return null;

  const { canvas, plan } = animation;
  const scale = fitScale(canvas.cols, canvas.rows, THUMB.width, THUMB.height);
  const ticks = ticksOf(frame.durationMs, plan.playRate);

  const history =
    frame.provenance.kind === 'hand-edited'
      ? 'edited by hand'
      : frame.provenance.repairs === 0
        ? 'as it was drawn'
        : frame.provenance.repairs === 1
          ? 'redrawn once'
          : `redrawn ${frame.provenance.repairs} times`;

  return (
    <DetailPanel
      eyebrow={`Frame ${index + 1} of ${animation.frames.length}`}
      title={
        <div className="flex items-center gap-2.5">
          <span
            className="grid shrink-0 place-items-center overflow-hidden rounded"
            style={{ ...THUMB, ...backdrop }}
          >
            <SpritePixels
              path={frame.file}
              version={animation.updatedAt}
              cols={canvas.cols}
              rows={canvas.rows}
              scale={scale}
              alt=""
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-medium">
              {frame.label ?? `Frame ${index + 1}`}
            </span>
            <span className="text-muted-foreground block font-mono text-xs">
              {canvas.cols} × {canvas.rows} · {ticks} tick{ticks === 1 ? '' : 's'} ·{' '}
              {Math.round(frame.durationMs)} ms
            </span>
          </span>
        </div>
      }
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onDuplicate}>
            <Plus className="size-3.5" />
            Insert after
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onDelete}>
            Delete
          </Button>
        </div>
      }
    >
      <Field label="Fix this frame">
        <Button type="button" variant="outline" className="justify-start" onClick={onEditPixels}>
          <Pencil className="size-3.5" />
          Edit the pixels yourself
        </Button>
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          onClick={() => {
            onFix(instruction.trim());
            setInstruction('');
          }}
        >
          <Sparkles className="size-3.5" />
          Ask the AI to redraw it
        </Button>
      </Field>

      {/*
        The source timing survives into the finished animation (D23), and this
        is where it is overridden — a hold that reads a beat too short is the
        commonest thing wrong with a sequence that is otherwise right.
      */}
      <Field label="How long it holds">
        <Input
          type="number"
          min={1}
          step={1}
          value={String(Math.round(frame.durationMs))}
          aria-label="Hold in milliseconds"
          onChange={(event) => {
            const wanted = Number(event.target.value);
            if (Number.isFinite(wanted) && wanted >= 1) onSetDuration(Math.round(wanted));
          }}
        />
      </Field>

      <Field label="Tell the AI what is wrong">
        <Textarea
          rows={3}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Optional. The whip is too thin where it crosses his hat."
        />
      </Field>

      <Field label="This frame's checks">
        {frame.findings.length === 0 ? (
          <Measure label="Every check" value="passed" />
        ) : (
          frame.findings.map((finding) => (
            <Measure
              key={`${finding.check}:${finding.message}`}
              label={finding.check}
              value={finding.message}
              tone={finding.level === 'refuse' ? 'bad' : 'warn'}
            />
          ))
        )}
        <Measure
          label="Root"
          value={frame.grounded ? `grounded at ${frame.root.y}` : `off the ground at ${frame.root.y}`}
          tone={frame.grounded ? 'ok' : 'plain'}
        />
        <Measure label="History" value={history} tone="plain" />
      </Field>
    </DetailPanel>
  );
}
