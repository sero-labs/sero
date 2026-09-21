import { useAvailableModels } from '@sero-ai/app-runtime';
import { MODEL_TIERS, modelKey, type ModelTier, type ThinkingLevel } from '@sero-ai/common';
import { ChevronRight } from 'lucide-react';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@sero-ai/ui';

import type { ModelChoice } from '../lib/actions';

/** The "inherit the global selection" entry. The styled Select refuses an empty value. */
const GLOBAL = '__global__';

/**
 * Per-tier model overrides chosen before the project exists. Folded away by
 * default: most projects inherit the Admin selection, and the rows only cost
 * space once someone wants them. A tier left on the global choice sends
 * nothing, so the project inherits exactly as it would without this section.
 *
 * The rows are the Project models table with its Effective and Source columns
 * left out, and use the same native selects, so the two pickers look alike.
 */
export function IntakeModelOverrides({ choices, onChange, disabled }: {
  choices: ModelChoice[];
  onChange(next: ModelChoice[]): void;
  disabled: boolean;
}) {
  const { groups } = useAvailableModels();
  const options = groups.flatMap((group) => group.models.map((model) => ({
    value: modelKey(model.provider, model.modelId),
    label: model.name,
    thinking: model.availableThinkingLevels ?? [],
  })));
  const set = (tier: ModelTier, next: ModelChoice | null) => {
    onChange([...choices.filter((choice) => choice.tier !== tier), ...(next ? [next] : [])]);
  };

  return (
    <Collapsible className="ar-intake-models">
      <CollapsibleTrigger className="ar-intake-models-trigger" disabled={disabled}>
        <ChevronRight className="size-4" />
        <span>Model overrides</span>
        {choices.length > 0 && <small>{choices.length} set</small>}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <table className="ar-tiers">
          <tbody>
            {MODEL_TIERS.map((tier) => {
              const current = choices.find((choice) => choice.tier === tier);
              const entry = current ? options.find((option) => option.value === current.model) : undefined;
              return (
                <tr key={tier} data-override={current ? 1 : 0}>
                  <td className="ar-tier">{tier}</td>
                  <td>
                    <Select
                      value={current?.model ?? GLOBAL}
                      disabled={disabled}
                      onValueChange={(value) => {
                        const picked = options.find((option) => option.value === value);
                        if (!picked) { set(tier, null); return; }
                        const thinking = current?.thinking && picked.thinking.includes(current.thinking) ? current.thinking : picked.thinking[0];
                        set(tier, { tier, model: picked.value, ...(thinking ? { thinking } : {}) });
                      }}
                    >
                      <SelectTrigger size="sm" aria-label={`${tier} model`} className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GLOBAL}>Global selection</SelectItem>
                        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {entry && entry.thinking.length > 0 && (
                      <Select
                        value={current?.thinking ?? entry.thinking[0]}
                        disabled={disabled}
                        onValueChange={(value) => set(tier, { tier, model: entry.value, thinking: value as ThinkingLevel })}
                      >
                        <SelectTrigger size="sm" aria-label={`${tier} thinking level`} className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {entry.thinking.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CollapsibleContent>
    </Collapsible>
  );
}
