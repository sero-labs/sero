import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { DesignBrief } from '../../../shared/design';
import type { ConflictResolution, GuardrailSynthesis } from '../../../shared/synthesis';
import type { DesignLibrarySettings } from '../../../shared/settings';
import type { ItemSummary } from '../../../shared/types';
import type { CreateDesignInput, DesignActions } from '../../hooks/useDesigns';
import { BriefFields, type Brief } from './BriefFields';
import { SynthesisRail } from './SynthesisRail';

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
  const [brief, setBrief] = useState<Brief>({
    request: '',
    recipeId: '',
    target: 'html',
    variationMode: 'blend',
    variantCount: settings.generation.variantCount,
    strengthIndex: 1,
    sessionRules: [],
  });
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
  const outputs = brief.variationMode === 'per-reference' ? references.length : brief.variantCount;
  const canGenerate = brief.request.trim() !== '' && unresolved.length === 0 && !busy;

  const submit = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setRefusal(null);
    const input: CreateDesignInput = {
      referenceItemIds: references.map((reference) => reference.id),
      request: brief.request.trim(),
      target: brief.target,
      variationMode: brief.variationMode,
      variantCount: brief.variantCount,
      inspirationStrength: STRENGTHS[brief.strengthIndex] ?? 'balanced',
      resolutions,
      sessionRules: brief.sessionRules,
      ...(brief.recipeId === '' ? {} : { recipeId: brief.recipeId }),
    };
    const outcome = await actions.create(input);
    setBusy(false);
    if (!outcome.ok) {
      setRefusal(outcome.message);
      return;
    }
    setBrief((current) => ({ ...current, request: '' }));
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-border space-y-1 border-b px-6 py-4">
          <DialogTitle>Create a new design</DialogTitle>
          <DialogDescription>
            Turn the selected references into original, runnable work.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[1.6fr_1fr]">
          <div className="px-6 py-5">
            <BriefFields
              brief={brief}
              settings={settings}
              synthesis={synthesis}
              referenceCount={references.length}
              onChange={(patch) => setBrief((current) => ({ ...current, ...patch }))}
              onSubmit={() => void submit()}
            />
          </div>

          <div className="border-border md:border-l px-5 py-5">
            <SynthesisRail
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
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
          {/* A refusal replaces the summary rather than sitting beside it: the
              summary describes work that is not going to happen. */}
          {refusal === null ? (
            <p className="text-muted-foreground text-sm">
              {outputs} original variant{outputs === 1 ? '' : 's'} · self-contained preview files
            </p>
          ) : (
            <p className="text-destructive text-sm">{refusal}</p>
          )}
          <Button type="button" disabled={!canGenerate} onClick={() => void submit()}>
            {busy ? 'Starting…' : 'Generate variants'}
            <Sparkles className="size-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
