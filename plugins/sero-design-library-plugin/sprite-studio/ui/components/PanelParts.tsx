import { Check, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The small pieces both checkpoints are built from.
 *
 * The reports are written in measurements rather than verdicts, so approving is
 * a judgement about the art and not about the machinery. These are the shapes
 * that keeps: a measured value, and beside it the sentence that says what the
 * measurement is for.
 */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** One measurement: what was measured, and what it came to. */
export function Measure({
  label,
  value,
  tone = 'ok',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad' | 'plain';
}) {
  const colour =
    tone === 'ok'
      ? 'text-primary'
      : tone === 'warn'
        ? 'text-amber-400'
        : tone === 'bad'
          ? 'text-destructive'
          : 'text-foreground';
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <b className={`font-mono text-xs font-medium ${colour}`}>{value}</b>
    </div>
  );
}

export type ReportTone = 'pass' | 'warn' | 'fail';

function ToneIcon({ tone }: { tone: ReportTone }) {
  if (tone === 'pass') return <Check className="text-primary size-3.5 shrink-0" />;
  if (tone === 'warn') return <TriangleAlert className="size-3.5 shrink-0 text-amber-400" />;
  return <X className="text-destructive size-3.5 shrink-0" />;
}

/** A row of the report: the check, what it found, and why it is checked. */
export function ReportRow({
  check,
  found,
  note,
  tone = 'pass',
}: {
  check: string;
  found: string;
  note?: string;
  tone?: ReportTone;
}) {
  return (
    <div className="border-border flex items-center gap-2.5 border-b px-3 py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground w-36 shrink-0 truncate">{check}</span>
      <ToneIcon tone={tone} />
      <span className="font-mono text-xs">{found}</span>
      {note !== undefined && (
        <span className="text-muted-foreground ml-auto hidden truncate font-mono text-xs lg:block">
          {note}
        </span>
      )}
    </div>
  );
}

export function Report({ children }: { children: ReactNode }) {
  return <div className="border-border overflow-hidden rounded-lg border">{children}</div>;
}

/** A small square-cornered fact, the way the stage carries its numbers. */
export function Chip({
  children,
  tone = 'plain',
}: {
  children: ReactNode;
  tone?: 'plain' | 'on' | 'warn';
}) {
  const style =
    tone === 'on'
      ? 'border-primary/30 bg-primary/10 text-primary'
      : tone === 'warn'
        ? 'border-amber-400/35 bg-amber-400/10 text-amber-400'
        : 'border-border bg-background/80 text-muted-foreground';
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-xs ${style}`}
    >
      {children}
    </span>
  );
}

export function Crumbs({ trail, last }: { trail: string[]; last: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
      {trail.map((step) => (
        <span key={step} className="flex items-center gap-1.5">
          {step}
          <span aria-hidden>›</span>
        </span>
      ))}
      <b className="text-foreground font-medium">{last}</b>
    </div>
  );
}

/** The right-hand panel both checkpoints and the workbench share. */
export function DetailPanel({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <aside className="border-border bg-card flex w-80 shrink-0 flex-col border-l">
      <div className="border-border border-b px-4 pt-4 pb-3">
        <div className="text-primary text-xs font-medium tracking-wide uppercase">{eyebrow}</div>
        <div className="mt-1.5 text-base font-medium">{title}</div>
        {subtitle !== undefined && (
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3.5">
        {children}
      </div>
      <div className="border-border flex flex-col gap-2 border-t px-4 py-3">{footer}</div>
    </aside>
  );
}
