import { Button } from '@sero-ai/ui';
import { AlertTriangle, Check } from 'lucide-react';

import type { ConflictResolution, GuardrailSynthesis } from '../../../shared/synthesis';
import type { ItemSummary } from '../../../shared/types';

/**
 * The synthesis panel: what the chosen references agree on, and what they do not
 * (spec §6.1, prototype state 3).
 *
 * Only genuinely incompatible guardrails block, and a blocking conflict has to be
 * resolved explicitly — the alternative is handing the generation run a brief
 * that contradicts itself and letting it pick a side silently.
 */

export interface GuardrailPanelProps {
  references: ItemSummary[];
  /** Null while the runtime is still working it out. */
  synthesis: GuardrailSynthesis | null;
  resolutions: ConflictResolution[];
  onResolve(resolution: ConflictResolution): void;
}

export function GuardrailPanel({
  references,
  synthesis,
  resolutions,
  onResolve,
}: GuardrailPanelProps) {
  const keptFor = (rule: string) =>
    resolutions.find((resolution) => resolution.rule === rule)?.keep;

  return (
    <aside className="border-border space-y-4 rounded-md border p-3">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          Selected inspiration
          <span className="text-muted-foreground ml-1.5 tabular-nums">{references.length}</span>
        </h3>
        <ol className="space-y-1">
          {references.map((reference, index) => (
            <li key={reference.id} className="flex items-baseline gap-2 text-sm">
              <span className="text-muted-foreground tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{reference.title}</span>
              {index === 0 && <span className="text-muted-foreground shrink-0">primary</span>}
            </li>
          ))}
        </ol>
      </section>

      {synthesis === null ? (
        <p className="text-muted-foreground text-sm">Reading the references…</p>
      ) : (
        <>
          <RuleList title="Always" rules={synthesis.always} />
          <RuleList title="Never" rules={synthesis.never} />

          {synthesis.conflicts.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-destructive flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="size-3.5" />
                {synthesis.conflicts.length} conflict
                {synthesis.conflicts.length === 1 ? '' : 's'} to resolve
              </h3>
              {synthesis.conflicts.map((conflict) => {
                const kept = keptFor(conflict.rule);
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
        </>
      )}
    </aside>
  );
}

function RuleList({ title, rules }: { title: string; rules: string[] }) {
  if (rules.length === 0) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="text-muted-foreground space-y-0.5 text-sm">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </section>
  );
}
