import { Button } from '@sero-ai/ui/components/ui/button';
import { Spinner } from '@sero-ai/ui/components/ui/spinner';
import { AlertTriangle, Check, Sparkles } from 'lucide-react';

import type { ConflictResolution, GuardrailSynthesis } from '../../../shared/synthesis';
import type { ItemSummary } from '../../../shared/types';

/**
 * What the chosen references are, and what they add up to (spec §6.1).
 *
 * No thumbnails: at rail width they are too small to recognise a design by, and
 * the reference was chosen moments ago in a grid that showed it full size. Title
 * and style say which one it is; the ordinal says which one leads.
 *
 * Only genuinely incompatible guardrails block, and a blocking conflict has to
 * be resolved explicitly — the alternative is handing the generation run a brief
 * that contradicts itself and letting it pick a side silently.
 */

/** Enough to characterise the blend; more reads as a tag cloud. */
const VISIBLE_TAGS = 6;

export interface SynthesisRailProps {
  references: ItemSummary[];
  /** Null while the runtime is still working it out. */
  synthesis: GuardrailSynthesis | null;
  resolutions: ConflictResolution[];
  onResolve(resolution: ConflictResolution): void;
}

export function SynthesisRail({
  references,
  synthesis,
  resolutions,
  onResolve,
}: SynthesisRailProps) {
  const conflicts = synthesis?.conflicts ?? [];
  const unresolved = conflicts.filter(
    (conflict) => !resolutions.some((resolution) => resolution.rule === conflict.rule),
  );

  return (
    <aside className="flex min-h-0 flex-col gap-4">
      <section className="space-y-2">
        <RailHeading>
          Selected inspiration
          <span className="text-muted-foreground tabular-nums">{references.length}</span>
        </RailHeading>
        <ol className="divide-border divide-y">
          {references.map((reference, index) => (
            <li key={reference.id} className="flex items-baseline gap-2.5 py-2 first:pt-0">
              <span className="text-muted-foreground w-3 shrink-0 tabular-nums">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{reference.title}</p>
                {reference.primaryStyle !== '' && (
                  <p className="text-muted-foreground truncate text-sm">
                    {reference.primaryStyle}
                  </p>
                )}
              </div>
              {index === 0 && (
                <span className="text-muted-foreground shrink-0 text-sm">leads</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {synthesis === null ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-3.5" />
          Reading the references…
        </p>
      ) : (
        <div
          className={`space-y-3 rounded-md border p-3 ${
            unresolved.length === 0
              ? 'border-primary/25 bg-primary/5'
              : 'border-destructive/30 bg-destructive/5'
          }`}
        >
          <p
            className={`flex items-center gap-1.5 text-sm font-medium ${
              unresolved.length === 0 ? 'text-primary' : 'text-destructive'
            }`}
          >
            <Sparkles className="size-3.5" />
            {unresolved.length === 0 ? 'Style synthesis ready' : 'Style synthesis blocked'}
          </p>

          <p className="text-muted-foreground text-sm">
            {describe(references.length, synthesis)}
          </p>

          <Tags references={references} />

          {conflicts.length > 0 && (
            <section className="border-destructive/20 space-y-3 border-t pt-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="text-destructive size-3.5" />
                {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} — keep one side
              </p>
              {conflicts.map((conflict) => {
                const kept = resolutions.find(
                  (resolution) => resolution.rule === conflict.rule,
                )?.keep;
                return (
                  <div key={conflict.rule} className="space-y-1.5">
                    <p className="text-sm">{conflict.rule}</p>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={kept === 'always' ? 'secondary' : 'outline'}
                        onClick={() => onResolve({ rule: conflict.rule, keep: 'always' })}
                      >
                        {kept === 'always' && <Check className="size-3" />}
                        Require it
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={kept === 'never' ? 'secondary' : 'outline'}
                        onClick={() => onResolve({ rule: conflict.rule, keep: 'never' })}
                      >
                        {kept === 'never' && <Check className="size-3" />}
                        Forbid it
                      </Button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-baseline justify-between gap-2 text-sm font-medium">{children}</h3>
  );
}

/** Plain arithmetic on what the synthesis found — never a claim about taste. */
function describe(referenceCount: number, synthesis: GuardrailSynthesis): string {
  const rules = synthesis.always.length + synthesis.never.length;
  const from = `${referenceCount} reference${referenceCount === 1 ? '' : 's'}`;
  if (rules === 0) return `No guardrails set on ${from}.`;
  return `${rules} guardrail${rules === 1 ? '' : 's'} drawn from ${from}, ${
    referenceCount === 1 ? 'leading the look' : 'led by the first'
  }.`;
}

/** Style tags in reference order, so the primary's vocabulary comes first. */
function Tags({ references }: { references: ItemSummary[] }) {
  const tags = [...new Set(references.flatMap((reference) => reference.tags))].slice(0, VISIBLE_TAGS);
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag}
          className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-sm"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}
