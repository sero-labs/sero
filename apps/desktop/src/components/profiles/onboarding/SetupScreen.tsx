import { useMemo, useState } from 'react';
import { Download, KeyRound, Sparkles, TriangleAlert } from 'lucide-react';
import {
  getAvailableThinkingLevels,
  getModelTierThinkingLevel,
  modelKey,
  parseModelKey,
  resolveSupportedThinkingLevel,
  validateGlobalTierSelections,
} from '@sero-ai/common';
import { AvailableModelPicker } from '@sero-ai/ui/components/model-selection/available-model-picker';
import { ModelWarningList } from '@sero-ai/ui/components/model-selection/model-warning-list';
import { ThinkingLevelPicker } from '@sero-ai/ui/components/model-selection/thinking-level-picker';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  DialogDescription,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import type {
  AvailableModelGroup,
  GlobalModelConfigInput,
  ModelInfo,
  ModelTier,
  ModelTierSettings,
  OnboardingContainerRuntime,
  OnboardingRecommendation,
  OnboardingWarning,
  ProviderHealthInfo,
} from '@/types/ipc';
import { BrowserPackOffer } from '@/components/runtime/BrowserPackOffer';
import { CoreToolsOffer } from '@/components/runtime/CoreToolsOffer';
import { ContainerRuntimeNotice } from './ContainerRuntimeNotice';
import { GitHubConnectCard } from './GitHubConnectCard';
import { useOnboardingGitHubStep } from './useOnboardingGitHubStep';

const GITHUB_STEP_CONFIG = {
  title: 'Connect GitHub (optional)',
  description: 'Strongly suggested if you work with repos. Connect now or continue setup and add GitHub later when you need it.',
} as const;

const TIERS: readonly { key: ModelTier; label: string; description: string }[] = [
  { key: 'LOW', label: 'Low', description: 'Fast and lightweight work' },
  { key: 'MED', label: 'Medium', description: 'General-purpose default' },
  { key: 'HIGH', label: 'High', description: 'Deep reasoning and complex work' },
];

function findTierModel(
  groups: AvailableModelGroup[],
  tiers: ModelTierSettings,
  tier: ModelTier,
): ModelInfo | null {
  const entry = tiers[tier];
  if (!entry) return null;
  const group = groups.find((candidate) => candidate.provider === entry.provider);
  return group?.models.find((candidate) => candidate.modelId === entry.modelId) ?? null;
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

export function OnboardingSetupScreen({
  recommendation,
  availableModelGroups,
  providerHealth,
  warnings,
  containerRuntime,
  launchNotice,
  continueDisabled = false,
  onContinue,
  onOpenProviders,
  onReconnectProvider,
}: {
  recommendation: OnboardingRecommendation;
  availableModelGroups: AvailableModelGroup[];
  providerHealth: ProviderHealthInfo[];
  warnings: OnboardingWarning[];
  containerRuntime: OnboardingContainerRuntime;
  launchNotice?: string | null;
  continueDisabled?: boolean;
  onContinue: (config: GlobalModelConfigInput) => void;
  onOpenProviders: () => void;
  onReconnectProvider: (providerId: string | null) => void;
}) {
  const [tiers, setTiers] = useState<ModelTierSettings>(recommendation.tiers);

  const modelWarnings = useMemo(
    () => validateGlobalTierSelections(tiers, availableModelGroups),
    [availableModelGroups, tiers],
  );

  const canContinue = TIERS.every(({ key }) => Boolean(tiers[key]));
  const {
    step,
    checkingGitHub,
    githubAuth,
    lastOutcome,
    handleTierContinue,
    handleContinueFromDependencies,
    handleConnectGitHub,
    handleBack,
    handleContinueFromGitHub,
  } = useOnboardingGitHubStep({
    tiers,
    canContinue,
    continueDisabled,
    onContinue,
  });

  if (step === 'dependencies') {
    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--bg-elevated)]">
            <Download className="size-5 text-[var(--status-success)]" />
          </div>
          <div>
            <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">Install host dependencies</DialogTitle>
            <DialogDescription className="text-sm text-[var(--text-secondary)]">
              Sero checks core development tools during setup. Browser support is optional unless you need screenshots, recordings, or web tasks.
            </DialogDescription>
          </div>
        </div>

        <ContainerRuntimeNotice runtime={containerRuntime} />
        <CoreToolsOffer reason="onboarding" autoInstall />
        <BrowserPackOffer reason="onboarding" />

        <div className="flex justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={continueDisabled || checkingGitHub}
          >
            Back
          </Button>
          <Button
            size="sm"
            onClick={() => void handleContinueFromDependencies()}
            disabled={continueDisabled || checkingGitHub}
          >
            {checkingGitHub ? 'Checking GitHub…' : 'Continue'}
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'github') {
    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--bg-elevated)]">
            <Sparkles className="size-5 text-[var(--status-success)]" />
          </div>
          <div>
            <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">{GITHUB_STEP_CONFIG.title}</DialogTitle>
            <DialogDescription className="text-sm text-[var(--text-secondary)]">
              {GITHUB_STEP_CONFIG.description}
            </DialogDescription>
          </div>
        </div>

        <GitHubConnectCard
          authStatus={githubAuth.authStatus}
          statusReady={githubAuth.statusReady}
          lastOutcome={lastOutcome}
          onConnect={() => {
            void handleConnectGitHub();
          }}
        />

        <div className="flex justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={continueDisabled}
          >
            Back
          </Button>
          <Button
            size="sm"
            onClick={handleContinueFromGitHub}
            disabled={continueDisabled}
          >
            Continue to memory setup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--bg-elevated)]">
          <Sparkles className="size-5 text-[var(--status-success)]" />
        </div>
        <div>
          <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">Choose your defaults</DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            Pick the LOW / MED / HIGH models and the thinking level each tier should use by default.
          </DialogDescription>
        </div>
      </div>

      {launchNotice ? (
        <div className="rounded-lg border border-[var(--status-success)]/20 bg-[var(--status-success)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
          {launchNotice}
        </div>
      ) : null}

      <div className="grid gap-4">
        {TIERS.map((tier) => {
          const entry = tiers[tier.key];
          const model = findTierModel(availableModelGroups, tiers, tier.key);
          const value = entry ? modelKey(entry.provider, entry.modelId) : '';
          return (
            <div key={tier.key} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/40 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{tier.label}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{tier.description}</p>
                </div>
              </div>

              <AvailableModelPicker
                className="mt-3"
                groups={availableModelGroups}
                value={value}
                onChange={(next) => {
                  setTiers((current) => {
                    const nextTiers = { ...current };
                    if (!next) {
                      delete nextTiers[tier.key];
                      return nextTiers;
                    }

                    const parsed = parseModelKey(next);
                    if (!parsed) return current;

                    const nextModel = availableModelGroups
                      .find((group) => group.provider === parsed.provider)
                      ?.models.find((candidate) => candidate.modelId === parsed.modelId);
                    const previousThinking = getModelTierThinkingLevel(current[tier.key]);

                    nextTiers[tier.key] = {
                      ...parsed,
                      thinkingLevel: nextModel
                        ? resolveSupportedThinkingLevel(nextModel, previousThinking)
                        : previousThinking,
                    };
                    return nextTiers;
                  });
                }}
                placeholder={`Choose a ${tier.label.toLowerCase()} model`}
                allowClear
              />

              <ThinkingLevelPicker
                className="mt-3"
                value={getModelTierThinkingLevel(entry, model?.reasoning ? 'high' : 'off')}
                availableLevels={model ? getAvailableThinkingLevels(model) : undefined}
                disabled={!model}
                onChange={(thinkingLevel) => {
                  setTiers((current) => {
                    const currentEntry = current[tier.key];
                    if (!currentEntry) return current;
                    return {
                      ...current,
                      [tier.key]: {
                        ...currentEntry,
                        thinkingLevel,
                      },
                    };
                  });
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onOpenProviders}
          disabled={continueDisabled}
          className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] disabled:opacity-50"
          title="Manage providers"
        >
          <KeyRound className="size-4" />
          Manage providers
        </button>
      </div>

      <ModelWarningList warnings={modelWarnings} />

      {warnings.map((warning) => (
        <WarningBanner
          key={warning.code}
          warning={warning}
          providerHealth={providerHealth}
          onReconnectProvider={onReconnectProvider}
        />
      ))}

      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          onClick={() => void handleTierContinue()}
          disabled={!canContinue || continueDisabled || checkingGitHub}
        >
          {checkingGitHub ? 'Checking GitHub…' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
