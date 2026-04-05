import { useState } from 'react';
import { KeyRound, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Label } from '@sero-ai/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui/components/ui/select';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import type {
  AvailableModelGroup,
  ModelTier,
  ModelTierSettings,
  OnboardingRecommendation,
  OnboardingWarning,
  ProviderHealthInfo,
  ResolvedProviderDefaultsState,
} from '@/types/ipc';
import { modelKey, parseModelKey } from '@/lib/model-keys';

const TIERS: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;

function getProviderGroup(
  groups: AvailableModelGroup[],
  providerId: string,
): AvailableModelGroup | undefined {
  return groups.find((group) => group.provider === providerId);
}

function scoreModelForTier(
  model: AvailableModelGroup['models'][number],
  tier: ModelTier,
): number {
  const haystack = `${model.modelId} ${model.name}`.toLowerCase();
  let score = 0;

  const isFast = /mini|haiku|flash|nano|small|instant|fast/.test(haystack);
  const isCapable = /pro|sonnet|opus|max|ultra|reason|thinking|gpt-5/.test(haystack);

  if (tier === 'LOW') {
    if (isFast) score += 40;
    if (isCapable) score -= 15;
    if (!model.reasoning) score += 8;
  }

  if (tier === 'MED') {
    if (isCapable) score += 20;
    if (model.reasoning) score += 8;
  }

  if (tier === 'HIGH') {
    if (isCapable) score += 35;
    if (model.reasoning) score += 15;
    if (isFast) score -= 15;
  }

  return score;
}

function getTierModelForProvider(
  providerId: string,
  tier: ModelTier,
  groups: AvailableModelGroup[],
  providerDefaults: ResolvedProviderDefaultsState,
): { provider: string; modelId: string } | null {
  const group = getProviderGroup(groups, providerId);
  if (!group || group.models.length === 0) return null;

  const preferredModelId = providerDefaults.effectiveDefaults[providerId]?.[tier];
  if (preferredModelId) {
    const preferredModel = group.models.find((model) => model.modelId === preferredModelId);
    if (preferredModel) {
      return {
        provider: preferredModel.provider,
        modelId: preferredModel.modelId,
      };
    }
  }

  const fallbackModel = [...group.models].sort((a, b) => {
    const scoreDelta = scoreModelForTier(b, tier) - scoreModelForTier(a, tier);
    if (scoreDelta !== 0) return scoreDelta;
    return a.name.localeCompare(b.name) || a.modelId.localeCompare(b.modelId);
  })[0];

  return fallbackModel
    ? { provider: fallbackModel.provider, modelId: fallbackModel.modelId }
    : null;
}

function getSuggestedTiersForProvider(
  providerId: string,
  groups: AvailableModelGroup[],
  providerDefaults: ResolvedProviderDefaultsState,
): ModelTierSettings {
  const result: ModelTierSettings = {};
  for (const tier of TIERS) {
    const entry = getTierModelForProvider(providerId, tier, groups, providerDefaults);
    if (entry) result[tier] = entry;
  }
  return result;
}

function getInitialProviderId(
  recommendation: OnboardingRecommendation,
  groups: AvailableModelGroup[],
): string {
  return recommendation.preferredProvider
    ?? recommendation.tiers.HIGH?.provider
    ?? recommendation.tiers.MED?.provider
    ?? recommendation.tiers.LOW?.provider
    ?? groups[0]?.provider
    ?? '';
}

function getInitialSimpleModelKey(
  recommendation: OnboardingRecommendation,
  providerId: string,
  groups: AvailableModelGroup[],
  providerDefaults: ResolvedProviderDefaultsState,
): string {
  const high = recommendation.tiers.HIGH;
  if (high && high.provider === providerId) return modelKey(high.provider, high.modelId);

  const med = recommendation.tiers.MED;
  if (med && med.provider === providerId) return modelKey(med.provider, med.modelId);

  const low = recommendation.tiers.LOW;
  if (low && low.provider === providerId) return modelKey(low.provider, low.modelId);

  const suggested = getSuggestedTiersForProvider(providerId, groups, providerDefaults);
  const entry = suggested.MED ?? suggested.HIGH ?? suggested.LOW;
  return entry ? modelKey(entry.provider, entry.modelId) : '';
}

function getModelName(
  groups: AvailableModelGroup[],
  provider: string,
  modelId: string,
): string {
  const group = getProviderGroup(groups, provider);
  const model = group?.models.find((candidate) => candidate.modelId === modelId);
  return model?.name ?? modelId;
}

function WarningBanner({
  warning,
  providerHealth,
  onReconnectProvider,
}: {
  warning: OnboardingWarning;
  providerHealth: ProviderHealthInfo[];
  onReconnectProvider: (providerId: string | null) => void;
}) {
  const providers = warning.providerIds
    ?.map((providerId) => providerHealth.find((provider) => provider.providerId === providerId))
    .filter((provider): provider is ProviderHealthInfo => Boolean(provider));

  return (
    <div className="rounded-lg border border-[var(--status-warning)]/25 bg-[var(--status-warning)]/5 px-3 py-2.5 text-xs text-[var(--text-secondary)]">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" />
        <div className="min-w-0 flex-1 space-y-2">
          <p>{warning.message}</p>
          {providers && providers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <button
                  key={provider.providerId}
                  onClick={() => onReconnectProvider(provider.providerId)}
                  className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  Reconnect {provider.displayName}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TierModelFields({
  providerId,
  availableModelGroups,
  tieredSelections,
  onTierChange,
}: {
  providerId: string;
  availableModelGroups: AvailableModelGroup[];
  tieredSelections: ModelTierSettings;
  onTierChange: (tier: ModelTier, value: string) => void;
}) {
  const providerGroup = getProviderGroup(availableModelGroups, providerId);
  if (!providerGroup) return null;

  return (
    <div className="grid gap-4">
      {TIERS.map((tier) => (
        <div key={tier} className="space-y-1.5">
          <Label className="text-xs font-medium text-[var(--text-primary)]">
            {tier === 'LOW' ? 'Low complexity' : tier === 'MED' ? 'Medium complexity' : 'High complexity'}
          </Label>
          <Select
            value={tieredSelections[tier] ? modelKey(tieredSelections[tier]!.provider, tieredSelections[tier]!.modelId) : ''}
            onValueChange={(value) => onTierChange(tier, value)}
          >
            <SelectTrigger className="h-10 text-left">
              <SelectValue placeholder={`Choose a ${tier.toLowerCase()} model`} />
            </SelectTrigger>
            <SelectContent>
              {providerGroup.models.map((model) => (
                <SelectItem key={modelKey(model.provider, model.modelId)} value={modelKey(model.provider, model.modelId)}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

export function OnboardingSetupScreen({
  recommendation,
  availableModelGroups,
  providerHealth,
  providerDefaults,
  warnings,
  launchNotice,
  continueDisabled = false,
  onContinue,
  onOpenProviders,
  onReconnectProvider,
}: {
  recommendation: OnboardingRecommendation;
  availableModelGroups: AvailableModelGroup[];
  providerHealth: ProviderHealthInfo[];
  providerDefaults: ResolvedProviderDefaultsState;
  warnings: OnboardingWarning[];
  launchNotice?: string | null;
  continueDisabled?: boolean;
  onContinue: (tiers: ModelTierSettings) => void;
  onOpenProviders: () => void;
  onReconnectProvider: (providerId: string | null) => void;
}) {
  const providerGroups = availableModelGroups.filter((group) => group.models.length > 0);
  const initialProviderId = getInitialProviderId(recommendation, providerGroups);
  const [selectedProviderId, setSelectedProviderId] = useState(initialProviderId);
  const [simpleModelKey, setSimpleModelKey] = useState(
    getInitialSimpleModelKey(recommendation, initialProviderId, providerGroups, providerDefaults),
  );
  const [useTieredModels, setUseTieredModels] = useState(false);
  const [simpleConfigChanged, setSimpleConfigChanged] = useState(false);
  const [tieredSelections, setTieredSelections] = useState<ModelTierSettings>(recommendation.tiers);

  const selectedProviderGroup = getProviderGroup(providerGroups, selectedProviderId);

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setTieredSelections(getSuggestedTiersForProvider(providerId, providerGroups, providerDefaults));
    setSimpleModelKey(getInitialSimpleModelKey(recommendation, providerId, providerGroups, providerDefaults));
    setSimpleConfigChanged(true);
  };

  const handleTierChange = (tier: ModelTier, value: string) => {
    const parsed = parseModelKey(value);
    if (!parsed) return;
    setTieredSelections((current) => ({ ...current, [tier]: parsed }));
  };

  const canContinue = useTieredModels
    ? TIERS.every((tier) => Boolean(tieredSelections[tier]))
    : Boolean(simpleModelKey) || TIERS.some((tier) => Boolean(recommendation.tiers[tier]));

  const handleContinue = () => {
    if (useTieredModels) {
      onContinue(tieredSelections);
      return;
    }

    if (!simpleConfigChanged) {
      onContinue(recommendation.tiers);
      return;
    }

    const parsed = parseModelKey(simpleModelKey);
    if (!parsed) return;
    onContinue({ LOW: parsed, MED: parsed, HIGH: parsed });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--bg-elevated)]">
          <Sparkles className="size-5 text-[var(--status-success)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Choose your model</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Pick a provider and default model to get started.
          </p>
        </div>
      </div>

      {launchNotice ? (
        <div className="rounded-lg border border-[var(--status-success)]/20 bg-[var(--status-success)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
          {launchNotice}
        </div>
      ) : null}

      <div className="grid gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs font-medium text-[var(--text-primary)]">Provider</Label>
            <button
              type="button"
              onClick={() => onOpenProviders()}
              disabled={continueDisabled}
              className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] disabled:opacity-50"
              title="Manage providers"
            >
              <KeyRound className="size-3" />
            </button>
          </div>
          <Select value={selectedProviderId} onValueChange={handleProviderChange}>
            <SelectTrigger className="h-10 text-left">
              <SelectValue placeholder="Choose a provider" />
            </SelectTrigger>
            <SelectContent>
              {providerGroups.map((group) => (
                <SelectItem key={group.provider} value={group.provider}>
                  {group.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[var(--text-primary)]">Default model</Label>
          <Select
            value={simpleModelKey}
            onValueChange={(value) => {
              setSimpleModelKey(value);
              setSimpleConfigChanged(true);
            }}
          >
            <SelectTrigger className="h-10 text-left">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {(selectedProviderGroup?.models ?? []).map((model) => (
                <SelectItem key={modelKey(model.provider, model.modelId)} value={modelKey(model.provider, model.modelId)}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!simpleConfigChanged && recommendation.tiers.HIGH ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              Current default: {getModelName(
                providerGroups,
                recommendation.tiers.HIGH.provider,
                recommendation.tiers.HIGH.modelId,
              )}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Use different models by complexity</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Optional: pick separate low, medium, and high complexity models.
            </p>
          </div>
          <Switch checked={useTieredModels} onCheckedChange={setUseTieredModels} />
        </div>

        {useTieredModels ? (
          <div className="mt-3.5 border-t border-[var(--border-default)] pt-3.5">
            <TierModelFields
              providerId={selectedProviderId}
              availableModelGroups={providerGroups}
              tieredSelections={tieredSelections}
              onTierChange={handleTierChange}
            />
          </div>
        ) : null}
      </div>

      {warnings.map((warning) => (
        <WarningBanner
          key={warning.code}
          warning={warning}
          providerHealth={providerHealth}
          onReconnectProvider={onReconnectProvider}
        />
      ))}

      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={handleContinue} disabled={!canContinue || continueDisabled}>
          Continue
        </Button>
      </div>
    </div>
  );
}
