import { CheckCircle2, KeyRound, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type {
  AvailableModelGroup,
  OnboardingRecommendation,
  OnboardingWarning,
  ProviderHealthInfo,
} from '@/types/ipc';
import { findGroup, findModel } from '@/components/layout/model-config';

function statusLabel(provider: ProviderHealthInfo): string {
  switch (provider.status) {
    case 'healthy':
      return 'healthy';
    case 'env':
      return 'env';
    case 'local':
      return 'local';
    case 'broken_expired':
      return 'expired';
    case 'broken_invalid':
      return 'invalid';
    case 'missing':
      return 'missing';
    case 'unknown':
    default:
      return 'unknown';
  }
}

function summarizeProviderHealth(providerHealth: ProviderHealthInfo[]): string {
  const healthyCount = providerHealth.filter((provider) => provider.hasUsableModels).length;
  const brokenCount = providerHealth.filter(
    (provider) => provider.status === 'broken_expired' || provider.status === 'broken_invalid',
  ).length;
  const envCount = providerHealth.filter((provider) => provider.status === 'env').length;
  const localCount = providerHealth.filter((provider) => provider.status === 'local').length;

  const parts = [`${healthyCount} usable provider${healthyCount === 1 ? '' : 's'}`];
  if (envCount > 0) parts.push(`${envCount} env-backed`);
  if (localCount > 0) parts.push(`${localCount} local`);
  if (brokenCount > 0) parts.push(`${brokenCount} needs attention`);
  return parts.join(' · ');
}

function sourceLabel(source: OnboardingRecommendation['sourcesByTier'][keyof OnboardingRecommendation['sourcesByTier']]) {
  switch (source) {
    case 'preserved':
      return 'Preserved';
    case 'provider-defaults':
      return 'Recommended';
    case 'imported':
      return 'Imported';
    case 'fallback':
    default:
      return 'Fallback';
  }
}

function TierSummaryCard({
  tierLabel,
  provider,
  modelName,
  source,
  logo,
}: {
  tierLabel: string;
  provider: string;
  modelName: string;
  source?: OnboardingRecommendation['sourcesByTier'][keyof OnboardingRecommendation['sourcesByTier']];
  logo?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {tierLabel}
        </span>
        {source ? (
          <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            {sourceLabel(source)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {logo ? <img src={logo} alt={provider} className="size-4 rounded-sm dark:invert" /> : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{modelName}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">{provider}</p>
        </div>
      </div>
    </div>
  );
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

export function ReadyScreen({
  recommendation,
  availableModelGroups,
  providerHealth,
  warnings,
  launchNotice,
  onContinue,
  onCustomize,
  onAddProvider,
  onReconnectProvider,
}: {
  recommendation: OnboardingRecommendation;
  availableModelGroups: AvailableModelGroup[];
  providerHealth: ProviderHealthInfo[];
  warnings: OnboardingWarning[];
  launchNotice?: string | null;
  onContinue: () => void;
  onCustomize: () => void;
  onAddProvider: () => void;
  onReconnectProvider: (providerId: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <Sparkles className="size-5 text-[var(--status-success)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sero is ready</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            We found a working setup and recommended the best LOW, MED, and HIGH tiers for this profile.
          </p>
        </div>
      </div>

      {launchNotice ? (
        <div className="rounded-lg border border-[var(--status-success)]/20 bg-[var(--status-success)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
          {launchNotice}
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-secondary)]">
        {summarizeProviderHealth(providerHealth)}
      </div>

      <div className="grid gap-3">
        {(['LOW', 'MED', 'HIGH'] as const).map((tier) => {
          const entry = recommendation.tiers[tier];
          if (!entry) return null;
          const group = findGroup(availableModelGroups, entry.provider, entry.modelId);
          const model = findModel(availableModelGroups, entry.provider, entry.modelId);
          return (
            <TierSummaryCard
              key={tier}
              tierLabel={tier}
              provider={group?.displayName ?? entry.provider}
              modelName={model?.name ?? entry.modelId}
              source={recommendation.sourcesByTier[tier]}
              logo={group?.logo}
            />
          );
        })}
      </div>

      {warnings.map((warning) => (
        <WarningBanner
          key={warning.code}
          warning={warning}
          providerHealth={providerHealth}
          onReconnectProvider={onReconnectProvider}
        />
      ))}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCustomize}>
            Customize models
          </Button>
          <Button variant="outline" size="sm" onClick={onAddProvider}>
            <KeyRound className="mr-2 size-3.5" />
            Add or reconnect provider
          </Button>
        </div>
        <Button size="sm" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

export function AuthScreen({
  providerHealth,
  launchNotice,
  onAddProvider,
  onReconnectProvider,
}: {
  providerHealth: ProviderHealthInfo[];
  launchNotice?: string | null;
  onAddProvider: () => void;
  onReconnectProvider: (providerId: string | null) => void;
}) {
  const actionableProviders = providerHealth.filter(
    (provider) => provider.status === 'broken_expired' || provider.status === 'broken_invalid',
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <KeyRound className="size-5 text-[var(--status-success)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connect a provider to continue</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Sero needs at least one usable model before it can launch your welcome session.
          </p>
        </div>
      </div>

      {launchNotice ? (
        <div className="rounded-lg border border-[var(--status-warning)]/20 bg-[var(--status-warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
          {launchNotice}
        </div>
      ) : null}

      {actionableProviders.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/50 p-3">
          <p className="text-xs font-medium text-[var(--text-primary)]">Providers that need attention</p>
          <div className="space-y-2">
            {actionableProviders.map((provider) => (
              <div key={provider.providerId} className="flex items-start justify-between gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{provider.displayName}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{provider.message}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onReconnectProvider(provider.providerId)}>
                  Reconnect
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-secondary)]">
        {providerHealth
          .filter((provider) => provider.status !== 'missing')
          .map((provider) => `${provider.displayName}: ${statusLabel(provider)}`)
          .join(' · ') || 'No providers configured yet.'}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onAddProvider}>
          <KeyRound className="mr-2 size-3.5" />
          Add provider
        </Button>
      </div>
    </div>
  );
}

export function LaunchingScreen({ statusMessage }: { statusMessage?: string | null }) {
  return (
    <div className="space-y-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
        <Loader2 className="size-5 animate-spin text-[var(--status-success)]" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Opening your welcome session</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Sero is saving your model setup and starting the memory onboarding flow.
        </p>
      </div>
      {statusMessage ? (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorScreen({
  message,
  onRetry,
  onBack,
}: {
  message: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <TriangleAlert className="size-5 text-[var(--status-warning)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Onboarding hit an error</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Something unexpected happened while Sero was preparing your first session.
          </p>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {message}
        </div>
      ) : null}

      <div className="flex justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

export function DoneNotice() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--status-success)]/20 bg-[var(--status-success)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
      <CheckCircle2 className="size-4 text-[var(--status-success)]" />
      Onboarding complete.
    </div>
  );
}
