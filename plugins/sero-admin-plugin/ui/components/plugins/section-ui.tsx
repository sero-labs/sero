import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared chrome for the plugin management sections so Installed, Local
 * development and Attached folders read as one consistent surface — thin
 * borders, semantic tokens, no heavy shadows (matches the sibling admin
 * panels such as Model and the resource sections).
 */
export function PluginSection({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/40 bg-card/30">
      {children}
    </section>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  meta,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground/80">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta}
        {action}
      </div>
    </div>
  );
}

/** A muted count pill, replacing the old rainbow of colored badges. */
export function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
