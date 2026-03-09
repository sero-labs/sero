/**
 * StatsRow — inline word/char/reading-time display.
 *
 * Compact single-line stats shown beneath text areas.
 */

import { computeStats } from '../lib/text-stats';

interface StatsRowProps {
  text: string;
}

export function StatsRow({ text }: StatsRowProps) {
  const stats = computeStats(text);
  if (stats.words === 0) return null;

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/40">
      <span>{stats.words} words</span>
      <span className="text-border/60">·</span>
      <span>{stats.chars} chars</span>
      <span className="text-border/60">·</span>
      <span>{stats.readingTime} read</span>
    </div>
  );
}
