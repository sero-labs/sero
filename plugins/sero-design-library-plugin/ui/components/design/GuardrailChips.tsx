import { Input, Label } from '@sero-ai/ui';
import { Ban, Check, Plus, X } from 'lucide-react';
import { useState } from 'react';

import type { GuardrailSynthesis } from '../../../shared/synthesis';

/**
 * The rules this run will be held to, and the one place to add another.
 *
 * Only rules in force are shown. The synthesis has already dropped whatever the
 * references did not agree on, so a rule appearing here is one the design will
 * be generated under — there is nothing to be gained from listing rules that
 * are not.
 *
 * They are the references' words, verbatim. Paraphrasing them into shorter
 * chips would change what the design is being generated under.
 */

export interface GuardrailChipsProps {
  synthesis: GuardrailSynthesis;
  /** Rules the user added for this Design alone. */
  sessionRules: string[];
  onChangeSessionRules(rules: string[]): void;
}

export function GuardrailChips({
  synthesis,
  sessionRules,
  onChangeSessionRules,
}: GuardrailChipsProps) {
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const rule = draft.trim();
    if (rule !== '' && !sessionRules.includes(rule)) onChangeSessionRules([...sessionRules, rule]);
    setDraft('');
    setDrafting(false);
  };

  const inForce = synthesis.always.length + synthesis.never.length + sessionRules.length;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label asChild>
          <span>Applied guardrails</span>
        </Label>
        <span className="text-muted-foreground text-sm">
          {inForce} in force
          {sessionRules.length > 0 && ` · ${sessionRules.length} yours`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {synthesis.always.map((rule) => (
          <Chip key={`always:${rule}`} icon={<Check className="size-3 shrink-0" />} label={rule} />
        ))}
        {synthesis.never.map((rule) => (
          <Chip key={`never:${rule}`} icon={<Ban className="size-3 shrink-0" />} label={rule} />
        ))}
        {sessionRules.map((rule) => (
          <Chip
            key={`session:${rule}`}
            icon={<Check className="size-3 shrink-0" />}
            label={rule}
            accent
            onRemove={() => onChangeSessionRules(sessionRules.filter((entry) => entry !== rule))}
          />
        ))}

        {drafting ? (
          <Input
            autoFocus
            value={draft}
            placeholder="Keep the palette to two colours"
            className="h-7 w-64"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                setDraft('');
                setDrafting(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="border-border text-muted-foreground hover:text-foreground flex h-7 items-center gap-1.5 rounded-md border border-dashed px-2 text-sm"
            onClick={() => setDrafting(true)}
          >
            <Plus className="size-3" />
            Session rule
          </button>
        )}
      </div>
    </section>
  );
}

function Chip({
  icon,
  label,
  accent,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-sm ${
        accent ? 'border-primary/30 text-foreground' : 'border-border text-muted-foreground'
      }`}
    >
      {icon}
      {label}
      {onRemove && (
        <button type="button" aria-label={`Remove "${label}"`} onClick={onRemove}>
          <X className="size-3 shrink-0" />
        </button>
      )}
    </span>
  );
}
