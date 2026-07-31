import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { useState } from 'react';

import type { AnimationPlan, LoopMode } from '../../shared/character';

/**
 * The plan, before a penny is spent.
 *
 * Frame count and play rate are separate: 30 fps is how fast it plays, not how
 * many drawings exist — a resting loop needs six drawings, not thirty. The
 * canvas is not editable because it is derived from the finished frames rather
 * than chosen in advance (D19), and where the feet leave the ground is the AI's
 * claim, which the runtime checks against the pixels rather than believing.
 */

export interface PlanRow {
  animationId: string;
  plan: AnimationPlan;
  canvas: { cols: number; rows: number };
}

const LOOP_LABEL: Record<LoopMode, string> = {
  once: 'plays once',
  forward: 'loops',
  pingpong: 'ping-pong',
};

interface PlanTableProps {
  rows: PlanRow[];
  onChange(animationId: string, patch: Partial<AnimationPlan>): void;
}

export function PlanTable({ rows, onChange }: PlanTableProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const totalFrames = rows.reduce((total, row) => total + row.plan.frameCount, 0);

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-border text-muted-foreground flex items-center gap-2 border-b px-3 py-2 text-sm">
        The plan
        <span className="ml-auto font-mono text-xs">
          {rows.length} animations · {totalFrames} frames · {rows.length} video calls
        </span>
      </div>
      {rows.map((row) => (
        <div key={row.animationId} className="border-border border-b last:border-b-0">
          <div className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-40 shrink-0 truncate font-medium">{row.plan.name}</span>
            <span className="text-muted-foreground w-20 shrink-0 font-mono text-xs">
              {row.plan.frameCount} frames
            </span>
            <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">
              {row.plan.playRate} fps
            </span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
              {row.canvas.cols} × {row.canvas.rows} canvas · {LOOP_LABEL[row.plan.loop]}
              {row.plan.airborne !== undefined &&
                ` · feet leave the ground for frames ${row.plan.airborne.from}–${row.plan.airborne.to}`}
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0 text-sm"
              onClick={() => setEditing(editing === row.animationId ? null : row.animationId)}
            >
              {editing === row.animationId ? 'Done' : 'Edit'}
            </button>
          </div>

          {editing === row.animationId && (
            <div className="bg-muted/40 grid grid-cols-[1fr_5rem_5rem_8rem] gap-2 px-3 pb-2.5">
              <Input
                className="h-8"
                aria-label="Name"
                value={row.plan.name}
                onChange={(event) => onChange(row.animationId, { name: event.target.value })}
              />
              <Input
                className="h-8"
                aria-label="Frames"
                inputMode="numeric"
                value={String(row.plan.frameCount)}
                onChange={(event) =>
                  onChange(row.animationId, { frameCount: Number(event.target.value) || 1 })
                }
              />
              <Input
                className="h-8"
                aria-label="Play rate"
                inputMode="numeric"
                value={String(row.plan.playRate)}
                onChange={(event) =>
                  onChange(row.animationId, { playRate: Number(event.target.value) || 1 })
                }
              />
              <Select
                value={row.plan.loop}
                onValueChange={(value) => onChange(row.animationId, { loop: value as LoopMode })}
              >
                <SelectTrigger className="h-8" aria-label="How it plays">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Plays once</SelectItem>
                  <SelectItem value="forward">Loops</SelectItem>
                  <SelectItem value="pingpong">Ping-pong</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="col-span-4 h-8"
                aria-label="Motion instruction"
                value={row.plan.instruction}
                onChange={(event) => onChange(row.animationId, { instruction: event.target.value })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
