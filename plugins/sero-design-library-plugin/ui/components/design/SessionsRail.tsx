import { Button } from '@sero-ai/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { DesignSummary } from '../../../shared/types';
import { relativeTime } from '../../lib/time';

/**
 * The Designs on the go, beside the one you are looking at (spec §6.7, prototype
 * state 4).
 *
 * Generation is slow and there is usually more than one Design in flight, so the
 * rail is what makes leaving one to look at another cost nothing — the work
 * carries on either way, and coming back lands where you left it.
 *
 * It collapses to icons rather than disappearing. That is what makes a widened
 * inspector affordable on a laptop, and a rail that vanishes takes the sense of
 * what else is running with it.
 */

/** Enough to see what is on the go; older Designs are reached from the Library. */
const VISIBLE_DESIGNS = 10;

export interface SessionsRailProps {
  designs: DesignSummary[];
  openDesignId: string | undefined;
  collapsed: boolean;
  onOpen(designId: string): void;
  onToggle(): void;
}

interface RailEntry {
  design: DesignSummary;
  ready: number;
  total: number;
  running: boolean;
}

function entryOf(design: DesignSummary): RailEntry {
  const ready = design.variants.filter((variant) => variant.status === 'ready').length;
  return {
    design,
    ready,
    total: design.variants.length,
    running: design.variants.some(
      (variant) => variant.status === 'running' || variant.status === 'pending',
    ),
  };
}

export function SessionsRail({
  designs,
  openDesignId,
  collapsed,
  onOpen,
  onToggle,
}: SessionsRailProps) {
  const entries = designs.slice(0, VISIBLE_DESIGNS).map(entryOf);
  const working = entries.filter((entry) => entry.running);
  const settled = entries.filter((entry) => !entry.running);

  if (collapsed) {
    return (
      <aside
        className="border-border flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2"
        aria-label="Designs"
      >
        <Toggle collapsed onToggle={onToggle} />
        {entries.map((entry) => (
          <button
            key={entry.design.id}
            type="button"
            title={entry.design.title}
            aria-label={entry.design.title}
            aria-current={entry.design.id === openDesignId}
            className={`size-7 rounded-md border text-xs font-medium ${
              entry.design.id === openDesignId
                ? 'border-primary text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/60'
            }`}
            onClick={() => onOpen(entry.design.id)}
          >
            {/* Two letters carry a design apart from its neighbours at this
                width; a dot would only say that something is there. */}
            {entry.design.title.slice(0, 2).toUpperCase()}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="border-border flex w-52 shrink-0 flex-col border-r" aria-label="Designs">
      <div className="flex items-center gap-1 px-2 py-2">
        <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
          Designs
        </h3>
        <div className="ml-auto flex items-center">
          <Toggle collapsed={false} onToggle={onToggle} />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-2">
        {working.length > 0 && (
          <Group label="Generating">
            {working.map((entry) => (
              <RailRow
                key={entry.design.id}
                entry={entry}
                open={entry.design.id === openDesignId}
                onOpen={onOpen}
              />
            ))}
          </Group>
        )}

        {settled.map((entry) => (
          <RailRow
            key={entry.design.id}
            entry={entry}
            open={entry.design.id === openDesignId}
            onOpen={onOpen}
          />
        ))}
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-muted-foreground px-1 text-xs tracking-wide uppercase">{label}</h4>
      {children}
    </section>
  );
}

function RailRow({
  entry,
  open,
  onOpen,
}: {
  entry: RailEntry;
  open: boolean;
  onOpen(designId: string): void;
}) {
  const { design, ready, total, running } = entry;

  return (
    <button
      type="button"
      aria-current={open}
      className={`block w-full rounded-md px-2 py-1.5 text-left ${
        open ? 'bg-muted' : 'hover:bg-muted/60'
      }`}
      onClick={() => onOpen(design.id)}
    >
      <span className="block truncate text-sm font-medium">{design.title}</span>
      <span className="text-muted-foreground block truncate text-xs">
        {running
          ? `${ready} of ${total} complete`
          : `${total} variant${total === 1 ? '' : 's'} · ${relativeTime(design.updatedAt, Date.now())}`}
      </span>
      {running && (
        <span className="bg-muted mt-1.5 block h-0.5 w-full overflow-hidden rounded-full">
          <span
            className="bg-primary block h-full transition-[width]"
            style={{ width: `${total === 0 ? 0 : (ready / total) * 100}%` }}
          />
        </span>
      )}
    </button>
  );
}

function Toggle({ collapsed, onToggle }: { collapsed: boolean; onToggle(): void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={collapsed ? 'Expand the Designs rail' : 'Collapse the Designs rail'}
      onClick={onToggle}
    >
      {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
    </Button>
  );
}
