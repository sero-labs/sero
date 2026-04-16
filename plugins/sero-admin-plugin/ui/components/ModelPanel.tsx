import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAvailableThinkingLevels,
  getModelTierThinkingLevel,
  modelKey,
  parseModelKey,
  resolveSupportedThinkingLevel,
  validateGlobalTierSelections,
} from '@sero/common';
import { AvailableModelPicker } from '@sero-ai/ui/components/model-selection/available-model-picker';
import { ModelWarningList } from '@sero-ai/ui/components/model-selection/model-warning-list';
import { ThinkingLevelPicker } from '@sero-ai/ui/components/model-selection/thinking-level-picker';
import { Button } from '@sero-ai/ui/components/ui/button';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import {
  getSero,
  type AvailableModelGroupIPC,
  type GlobalModelConfigStateIPC,
  type ModelInfoIPC,
} from '../hooks/host';
import { useBridgeRefresh } from '../hooks/useBridgeRefresh';

const TIERS = [
  { key: 'LOW' as const, label: 'Low', description: 'Fast and lightweight work' },
  { key: 'MED' as const, label: 'Medium', description: 'General-purpose default' },
  { key: 'HIGH' as const, label: 'High', description: 'Deep reasoning and complex tasks' },
];

interface DraftModelConfig {
  tiers: GlobalModelConfigStateIPC['tiers'];
}

function toDraft(state: GlobalModelConfigStateIPC): DraftModelConfig {
  return {
    tiers: state.tiers,
  };
}

function findSelectedModel(
  groups: AvailableModelGroupIPC[],
  entry: DraftModelConfig['tiers'][keyof DraftModelConfig['tiers']],
): ModelInfoIPC | null {
  if (!entry) return null;
  const group = groups.find((candidate) => candidate.provider === entry.provider);
  return group?.models.find((candidate) => candidate.modelId === entry.modelId) ?? null;
}

export function ModelPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GlobalModelConfigStateIPC | null>(null);
  const [draft, setDraft] = useState<DraftModelConfig | null>(null);
  const [groups, setGroups] = useState<AvailableModelGroupIPC[]>([]);

  const load = useCallback(async (options?: { background?: boolean; preserveDraft?: boolean }) => {
    const background = options?.background ?? false;
    const preserveDraft = options?.preserveDraft ?? false;

    if (!background) setLoading(true);
    setError(null);

    try {
      const [config, modelGroups] = await Promise.all([
        getSero().modelConfig.get(),
        getSero().models.list(),
      ]);
      setSaved(config);
      setGroups(modelGroups);
      setDraft((current) => preserveDraft && current ? current : toDraft(config));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model configuration');
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ background: true, preserveDraft: true });
  }, [load]);

  useBridgeRefresh(refresh);

  const hasChanges = useMemo(() => {
    if (!saved || !draft) return false;
    return JSON.stringify(toDraft(saved)) !== JSON.stringify(draft);
  }, [draft, saved]);

  const warnings = useMemo(() => {
    if (!draft) return [];
    return validateGlobalTierSelections(draft.tiers, groups);
  }, [draft, groups]);

  const handleTierChange = useCallback((tier: keyof DraftModelConfig['tiers'], value: string) => {
    setDraft((current) => {
      if (!current) return current;

      const nextTiers = { ...current.tiers };
      if (!value) {
        delete nextTiers[tier];
        return { ...current, tiers: nextTiers };
      }

      const parsed = parseModelKey(value);
      if (!parsed) return current;

      const nextModel = groups
        .find((group) => group.provider === parsed.provider)
        ?.models.find((candidate) => candidate.modelId === parsed.modelId);
      const previousThinking = getModelTierThinkingLevel(current.tiers[tier]);

      nextTiers[tier] = {
        ...parsed,
        thinkingLevel: nextModel
          ? resolveSupportedThinkingLevel(nextModel, previousThinking)
          : previousThinking,
      };

      return {
        ...current,
        tiers: nextTiers,
      };
    });
  }, [groups]);

  const handleThinkingChange = useCallback((tier: keyof DraftModelConfig['tiers'], thinkingLevel: string) => {
    setDraft((current) => {
      if (!current) return current;
      const entry = current.tiers[tier];
      if (!entry) return current;
      return {
        ...current,
        tiers: {
          ...current.tiers,
          [tier]: {
            ...entry,
            thinkingLevel,
          },
        },
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const next = await getSero().modelConfig.set(draft);
      setSaved(next);
      setDraft(toDraft(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model configuration');
    } finally {
      setSaving(false);
    }
  }, [draft]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading model settings…</div>
      </div>
    );
  }

  if (!draft || !saved) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-xs text-destructive">
        {error ?? 'Model configuration is unavailable.'}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border/30 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Model</h2>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Configure the global LOW / MED / HIGH model tiers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
          <Button variant="ghost" size="sm" disabled={!hasChanges || saving} onClick={() => setDraft(toDraft(saved))}>
            Reset
          </Button>
          <Button size="sm" disabled={!hasChanges || saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">
          {saved.migrationNotice ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              {saved.migrationNotice}
            </div>
          ) : null}

          <ModelWarningList warnings={warnings} />

          <div className="grid gap-4 xl:grid-cols-3">
            {TIERS.map((tier) => {
              const entry = draft.tiers[tier.key];
              const model = findSelectedModel(groups, entry);
              const value = entry ? modelKey(entry.provider, entry.modelId) : '';

              return (
                <div key={tier.key} className="rounded-xl border border-border/40 bg-background/60 p-4">
                  <p className="text-sm font-medium text-foreground">{tier.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{tier.description}</p>

                  <AvailableModelPicker
                    className="mt-3"
                    groups={groups}
                    value={value}
                    onChange={(next) => handleTierChange(tier.key, next)}
                    placeholder={`Choose a ${tier.label.toLowerCase()} model`}
                    noModelsLabel="No models available"
                    allowClear
                  />

                  <ThinkingLevelPicker
                    className="mt-3"
                    value={getModelTierThinkingLevel(entry, model?.reasoning ? 'high' : 'off')}
                    availableLevels={model ? getAvailableThinkingLevels(model) : undefined}
                    disabled={!model}
                    onChange={(thinkingLevel) => handleThinkingChange(tier.key, thinkingLevel)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
