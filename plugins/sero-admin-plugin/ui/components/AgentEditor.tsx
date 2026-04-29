/**
 * AgentEditor — form for editing agent metadata + system prompt.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Save, Trash2 } from 'lucide-react';
import {
  THINKING_LABELS,
  findModelByReference,
  getAvailableThinkingLevels,
  modelKey,
  resolveSupportedThinkingLevel,
  validateAgentModelConfig,
} from '@sero-ai/common';
import { AvailableModelPicker } from '@sero-ai/ui/components/model-selection/available-model-picker';
import { ModelWarningList } from '@sero-ai/ui/components/model-selection/model-warning-list';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { getSero, type AvailableModelGroupIPC, type GlobalModelConfigStateIPC } from '../hooks/host';
import { useBridgeRefresh } from '../hooks/useBridgeRefresh';
import type { AgentFileData, AgentModelConfig, StructuredAgentModel } from './types';

interface AgentEditorProps {
  data: AgentFileData;
  isNew: boolean;
  saving: boolean;
  onSave: (data: AgentFileData) => void;
  onDelete: (name: string) => void;
  onChange: (data: AgentFileData) => void;
}

const NAME_RE = /^[a-z0-9-]*$/;
const TIER_OPTIONS = ['LOW', 'MED', 'HIGH'] as const;
const CUSTOM_MODEL_VALUE = '__custom__';
const DEFAULT_MODEL_VALUE = '__default__';

function isTierValue(value: string): value is typeof TIER_OPTIONS[number] {
  return TIER_OPTIONS.includes(value as typeof TIER_OPTIONS[number]);
}

function getExplicitModelValue(model: AgentModelConfig | undefined, groups: AvailableModelGroupIPC[]): string {
  if (!model) return '';
  if (typeof model === 'string') {
    if (isTierValue(model)) return '';
    const resolved = findModelByReference(groups, model);
    return resolved ? modelKey(resolved.model.provider, resolved.model.modelId) : model;
  }

  const resolved = findModelByReference(groups, model.prefer);
  return resolved ? modelKey(resolved.model.provider, resolved.model.modelId) : model.prefer;
}

function getModelSelectValue(model: AgentModelConfig | undefined): string {
  if (!model) return DEFAULT_MODEL_VALUE;
  if (typeof model === 'string') {
    return isTierValue(model) ? model : CUSTOM_MODEL_VALUE;
  }
  return isTierValue(model.prefer) ? model.prefer : CUSTOM_MODEL_VALUE;
}

function getStructuredModel(model: AgentModelConfig | undefined): StructuredAgentModel | null {
  return model && typeof model !== 'string' ? model : null;
}

function getModelSelectionHelp(value: string): string {
  if (value === DEFAULT_MODEL_VALUE) {
    return 'Recommended for most agents. This follows Sero\'s default model behavior.';
  }

  if (value === 'LOW') {
    return 'Uses your LOW tier model and inherits the LOW tier thinking setting.';
  }

  if (value === 'MED') {
    return 'Uses your MED tier model and inherits the MED tier thinking setting.';
  }

  if (value === 'HIGH') {
    return 'Uses your HIGH tier model and inherits the HIGH tier thinking setting.';
  }

  return 'Pins this agent to one specific model and lets you choose a thinking level for it.';
}

export function AgentEditor({ data, isNew, saving, onSave, onDelete, onChange }: AgentEditorProps) {
  const [groups, setGroups] = useState<AvailableModelGroupIPC[]>([]);
  const [modelConfig, setModelConfig] = useState<GlobalModelConfigStateIPC | null>(null);
  const [customModeArmed, setCustomModeArmed] = useState(false);

  const refreshDependencies = useCallback(() => {
    void Promise.all([
      getSero().models.list().then(setGroups),
      getSero().modelConfig.get().then(setModelConfig),
    ]).catch((err) => {
      console.error('[admin] Failed to refresh model editor dependencies:', err);
    });
  }, []);

  useEffect(() => {
    refreshDependencies();
  }, [refreshDependencies]);

  useBridgeRefresh(refreshDependencies);

  const update = (partial: Partial<AgentFileData>) => onChange({ ...data, ...partial });
  const derivedModelSelectValue = getModelSelectValue(data.model);
  const modelSelectValue = customModeArmed ? CUSTOM_MODEL_VALUE : derivedModelSelectValue;
  const explicitModelValue = useMemo(() => getExplicitModelValue(data.model, groups), [data.model, groups]);
  const structuredModel = useMemo(() => getStructuredModel(data.model), [data.model]);
  const isPinnedModelMode = modelSelectValue === CUSTOM_MODEL_VALUE;
  const selectedPinnedModel = useMemo(() => {
    if (!isPinnedModelMode || !explicitModelValue) return null;
    return findModelByReference(groups, explicitModelValue)?.model ?? null;
  }, [explicitModelValue, groups, isPinnedModelMode]);
  const availablePinnedThinkingLevels = useMemo(
    () => selectedPinnedModel ? getAvailableThinkingLevels(selectedPinnedModel) : [],
    [selectedPinnedModel],
  );
  const warnings = useMemo(
    () => validateAgentModelConfig(data.model, groups, modelConfig?.tiers ?? {}),
    [data.model, groups, modelConfig?.tiers],
  );

  useEffect(() => {
    if (derivedModelSelectValue === CUSTOM_MODEL_VALUE) {
      setCustomModeArmed(false);
    }
  }, [derivedModelSelectValue]);

  const canSave =
    data.name.length > 0
    && NAME_RE.test(data.name)
    && data.systemPrompt.length > 0
    && (!isPinnedModelMode || explicitModelValue.length > 0);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(data);
  };

  const handleModelSelectChange = (value: string) => {
    if (value === DEFAULT_MODEL_VALUE) {
      setCustomModeArmed(false);
      update({ model: undefined, thinking: undefined });
      return;
    }

    if (value === CUSTOM_MODEL_VALUE) {
      setCustomModeArmed(true);
      return;
    }

    setCustomModeArmed(false);
    update({ model: value, thinking: undefined });
  };

  return (
    <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {isNew ? 'New Agent' : data.name}
        </span>
        {!isNew && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(data.name)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSave || saving}>
          {saving ? 'Saving…' : (
            <>
              <Save className="size-3.5" />
              Save
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3">
        <Field label="Name" hint="lowercase, hyphens only">
          <input
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={!isNew}
            placeholder="my-agent"
            className={cn(fieldClass, !isNew && 'opacity-60')}
          />
        </Field>

        <Field label="Description">
          <input
            type="text"
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this agent does"
            className={fieldClass}
          />
        </Field>

        <Field label="Model choice" hint="usually LOW / MED / HIGH">
          <select
            value={modelSelectValue}
            onChange={(e) => handleModelSelectChange(e.target.value)}
            className={fieldClass}
          >
            <option value={DEFAULT_MODEL_VALUE}>Use Sero default (recommended)</option>
            <option value="LOW">LOW — fast</option>
            <option value="MED">MED — balanced</option>
            <option value="HIGH">HIGH — strongest</option>
            <option value={CUSTOM_MODEL_VALUE}>Pick a specific model…</option>
          </select>
        </Field>

        <Field label="Thinking" hint={isPinnedModelMode ? 'only used for a pinned model' : 'inherited from the selected tier'}>
          <select
            value={isPinnedModelMode ? (data.thinking || '') : ''}
            onChange={(e) => update({ thinking: e.target.value || undefined })}
            disabled={!isPinnedModelMode || !selectedPinnedModel}
            className={cn(fieldClass, (!isPinnedModelMode || !selectedPinnedModel) && 'opacity-60')}
          >
            <option value="" disabled>
              {!isPinnedModelMode
                ? 'Inherited from model choice'
                : selectedPinnedModel
                  ? 'Choose thinking…'
                  : 'Pick a model first'}
            </option>
            {availablePinnedThinkingLevels.map((level) => (
              <option key={level} value={level}>
                {THINKING_LABELS[level]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground/80">
          {getModelSelectionHelp(modelSelectValue)}
        </p>

        {modelSelectValue === CUSTOM_MODEL_VALUE ? (
          <div className="mt-3">
            <Field label="Pinned model" hint="only use this when the tier options are not enough">
              <AvailableModelPicker
                groups={groups}
                value={explicitModelValue}
                onChange={(value) => {
                  if (!value) {
                    update({ model: undefined, thinking: undefined });
                    return;
                  }

                  const resolved = findModelByReference(groups, value);
                  update({
                    model: value,
                    thinking: resolved
                      ? resolveSupportedThinkingLevel(resolved.model, data.thinking ?? 'high')
                      : data.thinking,
                  });
                }}
                placeholder="Choose a specific model"
                allowClear
                className="mt-1"
              />
            </Field>
          </div>
        ) : null}

        {structuredModel?.fallbacks.length ? (
          <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            This agent was using an older advanced fallback setup with {structuredModel.fallbacks.length} fallback
            {structuredModel.fallbacks.length === 1 ? '' : 's'}. If you save changes here, it will be simplified to one tier or one pinned model.
          </div>
        ) : null}

        <ModelWarningList className="mt-3" warnings={warnings} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <label className="mb-1.5 text-xs font-medium text-muted-foreground">System Prompt</label>
        <textarea
          value={data.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="You are a specialist agent that..."
          className={cn(
            'flex-1 min-h-0 resize-none rounded-md border border-input bg-background',
            'px-3 py-2 font-mono text-sm leading-relaxed text-foreground',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
      </div>
    </form>
  );
}

const fieldClass = cn(
  'w-full rounded-md border border-input bg-background',
  'px-2.5 py-1.5 text-sm text-foreground',
  'placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
);

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 font-normal text-muted-foreground/50">({hint})</span> : null}
      </label>
      {children}
    </div>
  );
}
