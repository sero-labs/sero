import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  NativeSelect,
  Slider,
  Textarea,
} from '@sero-ai/ui';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { DesignBrief } from '../../../shared/design';
import { MAX_VARIANTS, MIN_VARIANTS } from '../../../shared/design';
import type { ConflictResolution, GuardrailSynthesis } from '../../../shared/synthesis';
import type { DesignLibrarySettings, PromptRecipe } from '../../../shared/settings';
import type { ItemSummary } from '../../../shared/types';
import type { CreateDesignInput, DesignActions } from '../../hooks/useDesigns';
import { GuardrailPanel } from './GuardrailPanel';

/**
 * One focused decision: what to make, from which references, under what rules
 * (spec §6.2).
 *
 * The synthesis is fetched from the runtime rather than computed here, because
 * the runtime is what will act on it — computing a second opinion in the browser
 * would let the dialog show one set of conflicts while generation was blocked on
 * another.
 */

const STRENGTHS: DesignBrief['inspirationStrength'][] = ['light', 'balanced', 'strong'];

export interface CreateDesignDialogProps {
  open: boolean;
  /** Ordered as the user picked them; the first leads the visual direction. */
  references: ItemSummary[];
  settings: DesignLibrarySettings;
  actions: DesignActions;
  onOpenChange(open: boolean): void;
  onCreated(): void;
}

export function CreateDesignDialog({
  open,
  references,
  settings,
  actions,
  onOpenChange,
  onCreated,
}: CreateDesignDialogProps) {
  const [request, setRequest] = useState('');
  const [recipeId, setRecipeId] = useState('');
  const [target, setTarget] = useState<DesignBrief['target']>('html');
  const [variationMode, setVariationMode] = useState<DesignBrief['variationMode']>('blend');
  const [variantCount, setVariantCount] = useState(settings.generation.variantCount);
  const [strengthIndex, setStrengthIndex] = useState(1);
  const [synthesis, setSynthesis] = useState<GuardrailSynthesis | null>(null);
  const [resolutions, setResolutions] = useState<ConflictResolution[]>([]);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const referenceIds = references.map((reference) => reference.id).join(',');

  // The synthesis lives in the runtime, so reading it is a tool call — an
  // external effect, not derived state.
  useEffect(() => {
    if (!open || references.length === 0) return;
    let active = true;
    setSynthesis(null);
    setResolutions([]);
    void actions.synthesis(referenceIds.split(',')).then((result) => {
      if (active) setSynthesis(result);
    });
    return () => {
      active = false;
    };
  }, [open, referenceIds, actions, references.length]);

  const conflicts = synthesis?.conflicts ?? [];
  const unresolved = conflicts.filter(
    (conflict) => !resolutions.some((resolution) => resolution.rule === conflict.rule),
  );
  const outputs = variationMode === 'per-reference' ? references.length : variantCount;
  const canGenerate = request.trim() !== '' && unresolved.length === 0 && !busy;

  const submit = async () => {
    setBusy(true);
    setRefusal(null);
    const input: CreateDesignInput = {
      referenceItemIds: references.map((reference) => reference.id),
      request: request.trim(),
      target,
      variationMode,
      variantCount,
      inspirationStrength: STRENGTHS[strengthIndex] ?? 'balanced',
      resolutions,
      ...(recipeId === '' ? {} : { recipeId }),
    };
    const outcome = await actions.create(input);
    setBusy(false);
    if (!outcome.ok) {
      setRefusal(outcome.message);
      return;
    }
    setRequest('');
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create a new design</DialogTitle>
          <DialogDescription>
            Turn the selected references into original, runnable work.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="design-request">What should Sero create?</Label>
              <Textarea
                id="design-request"
                value={request}
                rows={4}
                autoFocus
                placeholder="A responsive analytics dashboard for monitoring agent tasks, failures and token usage."
                onChange={(event) => setRequest(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prompt recipe" htmlFor="design-recipe">
                <NativeSelect
                  id="design-recipe"
                  value={recipeId}
                  onChange={(event) => setRecipeId(event.target.value)}
                >
                  <option value="">No recipe</option>
                  {settings.generation.recipes.map((recipe: PromptRecipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Output target" htmlFor="design-target">
                <NativeSelect
                  id="design-target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value as DesignBrief['target'])}
                >
                  <option value="html">HTML, CSS + JavaScript</option>
                  <option value="react">React + Tailwind</option>
                </NativeSelect>
              </Field>

              <Field label="Variation mode" htmlFor="design-mode">
                <NativeSelect
                  id="design-mode"
                  value={variationMode}
                  onChange={(event) =>
                    setVariationMode(event.target.value as DesignBrief['variationMode'])
                  }
                >
                  <option value="blend">Blend all references</option>
                  <option value="per-reference">One variant per reference</option>
                </NativeSelect>
              </Field>

              <Field label="Variants" htmlFor="design-variants">
                <NativeSelect
                  id="design-variants"
                  value={String(variantCount)}
                  disabled={variationMode === 'per-reference'}
                  onChange={(event) => setVariantCount(Number(event.target.value))}
                >
                  {Array.from({ length: MAX_VARIANTS - MIN_VARIANTS + 1 }, (_, index) => (
                    <option key={index} value={String(MIN_VARIANTS + index)}>
                      {MIN_VARIANTS + index}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="design-strength">Inspiration strength</Label>
                <span className="text-muted-foreground text-sm capitalize">
                  {STRENGTHS[strengthIndex]}
                </span>
              </div>
              <Slider
                id="design-strength"
                min={0}
                max={STRENGTHS.length - 1}
                step={1}
                value={[strengthIndex]}
                onValueChange={([value]) => setStrengthIndex(value ?? 1)}
              />
            </div>
          </div>

          <GuardrailPanel
            references={references}
            synthesis={synthesis}
            resolutions={resolutions}
            onResolve={(resolution) =>
              setResolutions((current) => [
                ...current.filter((entry) => entry.rule !== resolution.rule),
                resolution,
              ])
            }
          />
        </div>

        {refusal !== null && <p className="text-destructive text-sm">{refusal}</p>}

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            {outputs} original variant{outputs === 1 ? '' : 's'} · self-contained preview files
          </p>
          <Button type="button" disabled={!canGenerate} onClick={() => void submit()}>
            {busy ? 'Starting…' : 'Generate variants'}
            <Sparkles className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
