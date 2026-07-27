import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@sero-ai/ui';
import { Ban, Check, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import type { DesignBrief } from '../../../shared/design';
import { MAX_VARIANTS, MIN_VARIANTS } from '../../../shared/design';
import type { GuardrailSynthesis } from '../../../shared/synthesis';
import type { DesignLibrarySettings, PromptRecipe } from '../../../shared/settings';

/**
 * The brief: what to make, and how much freedom the run has making it.
 *
 * Two-choice settings are shown as both choices rather than as a dropdown —
 * variation mode and variant count are the two things worth changing here, and
 * a dropdown hides the alternative behind a click for no gain.
 */

const STRENGTHS: DesignBrief['inspirationStrength'][] = ['light', 'balanced', 'strong'];

/** Enough to see what the run is held to; the rest is one click away. */
const VISIBLE_GUARDRAILS = 4;

/** Stands in for "no recipe", which the brief stores as an empty string. */
const NO_RECIPE = 'none';

export interface Brief {
  request: string;
  recipeId: string;
  target: DesignBrief['target'];
  variationMode: DesignBrief['variationMode'];
  variantCount: number;
  strengthIndex: number;
}

export interface BriefFieldsProps {
  brief: Brief;
  settings: DesignLibrarySettings;
  /** Null while the runtime is still synthesising; guardrails stay hidden. */
  synthesis: GuardrailSynthesis | null;
  referenceCount: number;
  outputs: number;
  onChange(patch: Partial<Brief>): void;
  onSubmit(): void;
}

export function BriefFields({
  brief,
  settings,
  synthesis,
  referenceCount,
  outputs,
  onChange,
  onSubmit,
}: BriefFieldsProps) {
  const perReference = brief.variationMode === 'per-reference';

  return (
    <div className="space-y-5">
      <section className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="design-request">What should Sero create?</Label>
          <span className="text-muted-foreground text-sm">⌘ Enter to generate</span>
        </div>
        <Textarea
          id="design-request"
          value={brief.request}
          rows={4}
          autoFocus
          placeholder="A responsive analytics dashboard for monitoring agent tasks, failures and token usage."
          onChange={(event) => onChange({ request: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSubmit();
          }}
        />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prompt recipe" htmlFor="design-recipe">
          {/* `NO_RECIPE` rather than '': Radix treats an empty value as "no
              selection" and refuses to render it as a choice. */}
          <Select
            value={brief.recipeId === '' ? NO_RECIPE : brief.recipeId}
            onValueChange={(value) => onChange({ recipeId: value === NO_RECIPE ? '' : value })}
          >
            <SelectTrigger id="design-recipe" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_RECIPE}>No recipe</SelectItem>
              {settings.generation.recipes.map((recipe: PromptRecipe) => (
                <SelectItem key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Output target" htmlFor="design-target">
          <Select
            value={brief.target}
            onValueChange={(value) => onChange({ target: value as DesignBrief['target'] })}
          >
            <SelectTrigger id="design-target" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="html">HTML, CSS + JavaScript</SelectItem>
              <SelectItem value="react">React + Tailwind</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Variation mode">
          <ToggleGroup
            type="single"
            variant="outline"
            value={brief.variationMode}
            // Radix clears the value when the active item is pressed again;
            // an empty mode is not a state this brief has.
            onValueChange={(value) => {
              if (value !== '') onChange({ variationMode: value as DesignBrief['variationMode'] });
            }}
            className="grid w-full grid-cols-2"
          >
            <ToggleGroupItem value="blend">Blend</ToggleGroupItem>
            <ToggleGroupItem value="per-reference">Per reference</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field
          label="Variants"
          hint={`${outputs} output${outputs === 1 ? '' : 's'} total`}
        >
          <VariantStepper
            value={perReference ? referenceCount : brief.variantCount}
            // One variant per reference: the count is the reference list, and a
            // stepper that silently disagreed with the footer would be a lie.
            disabled={perReference}
            onChange={(variantCount) => onChange({ variantCount })}
          />
        </Field>
      </div>

      <section className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="design-strength">Inspiration strength</Label>
          <span className="text-muted-foreground text-sm capitalize">
            {STRENGTHS[brief.strengthIndex]}
          </span>
        </div>
        <Slider
          id="design-strength"
          min={0}
          max={STRENGTHS.length - 1}
          step={1}
          value={[brief.strengthIndex]}
          onValueChange={([value]) => onChange({ strengthIndex: value ?? 1 })}
        />
        <div className="text-muted-foreground flex justify-between text-sm">
          {STRENGTHS.map((strength) => (
            <span key={strength} className="capitalize">
              {strength}
            </span>
          ))}
        </div>
      </section>

      {synthesis !== null && <AppliedGuardrails synthesis={synthesis} />}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        {htmlFor === undefined ? (
          <Label asChild>
            <span>{label}</span>
          </Label>
        ) : (
          <Label htmlFor={htmlFor}>{label}</Label>
        )}
        {hint !== undefined && <span className="text-muted-foreground text-sm">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function VariantStepper({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange(value: number): void;
}) {
  return (
    <div
      className={`border-input flex h-9 items-center justify-between rounded-md border ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <StepButton
        label="One fewer variant"
        disabled={disabled || value <= MIN_VARIANTS}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-3.5" />
      </StepButton>
      <span className="tabular-nums" aria-live="polite">
        {value}
      </span>
      <StepButton
        label="One more variant"
        disabled={disabled || value >= MAX_VARIANTS}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3.5" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * The rules this run will be held to, as one glanceable row. They are the
 * references' words, shown verbatim: paraphrasing them into short chips would
 * change what the design is being generated under.
 */
function AppliedGuardrails({ synthesis }: { synthesis: GuardrailSynthesis }) {
  const [expanded, setExpanded] = useState(false);
  const rules = [
    ...synthesis.always.map((rule) => ({ rule, keep: 'always' as const })),
    ...synthesis.never.map((rule) => ({ rule, keep: 'never' as const })),
  ];
  if (rules.length === 0) return null;
  const shown = expanded ? rules : rules.slice(0, VISIBLE_GUARDRAILS);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label asChild>
          <span>Applied guardrails</span>
        </Label>
        {rules.length > shown.length ? (
          <button
            type="button"
            className="text-muted-foreground text-sm underline underline-offset-2"
            onClick={() => setExpanded(true)}
          >
            Show all {rules.length}
          </button>
        ) : (
          <span className="text-muted-foreground text-sm">from the references</span>
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map(({ rule, keep }) => (
          <li
            key={`${keep}:${rule}`}
            className="border-border text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
          >
            {keep === 'always' ? (
              <Check className="size-3 shrink-0" />
            ) : (
              <Ban className="size-3 shrink-0" />
            )}
            {rule}
          </li>
        ))}
      </ul>
    </section>
  );
}
