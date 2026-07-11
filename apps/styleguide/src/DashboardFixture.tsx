import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sero-ai/ui';
import {
  ActivityExample,
  ResourceExample,
  SchedulerExample,
  StarterExample,
} from '@sero-ai/ui/reference';
import type { ReactNode } from 'react';

// Approximate the real dashboard cell geometry (6 cols, 120px rows) so the
// preview reads at the sizes widgets actually ship at.
const SIZE = {
  '1x1': { w: 190, h: 120 },
  '2x2': { w: 392, h: 246 },
  '3x2': { w: 596, h: 246 },
} as const;

type SizeKey = keyof typeof SIZE;

/**
 * A single glass tile framing a widget, mirroring the desktop
 * DashboardWidget wrapper (fixed cell, content scrolls within).
 */
function GlassTile({
  size,
  label,
  children,
}: {
  size: SizeKey;
  label: string;
  children: ReactNode;
}) {
  const { w, h } = SIZE[size];
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div
        className="glass-tile relative flex flex-col overflow-hidden"
        style={{ width: w, height: h }}
      >
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
      <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/**
 * Dashboard widgets fixture — renders the exported reference set on the shared
 * glass board (`.glass-canvas` → `.glass-tile`), so the frosted look and text
 * legibility can be reviewed in light and dark before shipping. This is the
 * review surface that replaced the old showcase plugin's gallery.
 */
export function DashboardFixture() {
  return (
    <Card id="dashboard-fixture" className="overflow-hidden 2xl:col-span-2">
      <CardHeader>
        <CardTitle>Dashboard widgets</CardTitle>
        <CardDescription>
          The @sero-ai/ui reference set on the shared glass board. Cards read as
          raised, rows as flat; muted text must stay legible on the canvas glow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="glass-canvas flex flex-wrap gap-3 rounded-2xl p-4">
          <GlassTile size="2x2" label="Scheduler · 2×2">
            <SchedulerExample />
          </GlassTile>
          <GlassTile size="2x2" label="Resources · 2×2">
            <ResourceExample />
          </GlassTile>
          <GlassTile size="2x2" label="Activity · 2×2">
            <ActivityExample />
          </GlassTile>
          <GlassTile size="1x1" label="Starter · 1×1">
            <StarterExample />
          </GlassTile>
        </div>

        <p className="mt-4 mb-2 text-xs font-medium text-muted-foreground">
          Size range — one widget across the review sizes
        </p>
        <div className="glass-canvas flex flex-wrap items-start gap-3 rounded-2xl p-4">
          <GlassTile size="1x1" label="1×1">
            <SchedulerExample />
          </GlassTile>
          <GlassTile size="2x2" label="2×2">
            <SchedulerExample />
          </GlassTile>
          <GlassTile size="3x2" label="3×2">
            <SchedulerExample />
          </GlassTile>
        </div>
      </CardContent>
    </Card>
  );
}
