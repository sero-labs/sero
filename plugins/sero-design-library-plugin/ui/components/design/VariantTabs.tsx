import type { DesignVariantSummary } from '../../../shared/types';

/**
 * One tab per variant, with its status as a dot and the name the run gave it.
 *
 * Variants run independently, so the row has to show them at different stages at
 * once — one rendered, one still working, one failed — rather than a single
 * progress state for the Design.
 *
 * The number stays alongside the name. It is what everything else calls the
 * variant — the record, the preview title, a retry — and a tab that only said
 * "Glass telemetry" would leave nothing to match those against.
 */

const DOT: Record<DesignVariantSummary['status'], string> = {
  pending: 'bg-muted-foreground/40',
  running: 'bg-primary animate-pulse',
  ready: 'bg-primary',
  failed: 'bg-destructive',
  cancelled: 'bg-muted-foreground/40',
};

export interface VariantTabsProps {
  variants: DesignVariantSummary[];
  activeId: string | undefined;
  onSelect(variantId: string): void;
}

export function VariantTabs({ variants, activeId, onSelect }: VariantTabsProps) {
  if (variants.length === 0) return null;

  return (
    <div
      className="border-border flex items-center gap-1 overflow-x-auto border-b px-3 py-1.5"
      role="tablist"
      aria-label="Variants"
    >
      {variants.map((variant) => (
        <button
          key={variant.id}
          type="button"
          role="tab"
          aria-selected={variant.id === activeId}
          className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1 text-sm ${
            variant.id === activeId ? 'bg-accent' : 'text-muted-foreground hover:bg-accent/50'
          }`}
          onClick={() => onSelect(variant.id)}
        >
          <span className={`size-1.5 rounded-full ${DOT[variant.status]}`} aria-hidden />
          <span className="text-muted-foreground tabular-nums">
            {String(variant.index + 1).padStart(2, '0')}
          </span>
          {variant.name !== undefined && <span className="max-w-40 truncate">{variant.name}</span>}
          {variant.warningCount > 0 && (
            <span className="text-muted-foreground tabular-nums">{variant.warningCount}⚠</span>
          )}
        </button>
      ))}
    </div>
  );
}
