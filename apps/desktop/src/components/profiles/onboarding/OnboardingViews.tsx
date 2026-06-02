import type { ReactNode } from 'react';
import { KeyRound, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  DialogDescription,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import type { ProviderHealthInfo } from '@/types/ipc';

export { OnboardingSetupScreen } from './SetupScreen';

function CenteredStatusHeader({
  icon,
  title,
  description,
  step,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  step: string;
}) {
  return (
    <div data-onboarding-step={step} className="flex flex-col items-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--bg-elevated)]">
        {icon}
      </div>
      <div className="max-w-sm space-y-1.5">
        <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">{title}</DialogTitle>
        <DialogDescription className="text-sm leading-6 text-[var(--text-secondary)]">
          {description}
        </DialogDescription>
      </div>
    </div>
  );
}

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

export function AuthScreen({
  providerHealth,
  launchNotice,
  onOpenProviders,
  onReconnectProvider,
}: {
  providerHealth: ProviderHealthInfo[];
  launchNotice?: string | null;
  onOpenProviders: () => void;
  onReconnectProvider: (providerId: string | null) => void;
}) {
  const actionableProviders = providerHealth.filter(
    (provider) => provider.status === 'broken_expired' || provider.status === 'broken_invalid',
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <KeyRound className="size-5 text-status-success" />
        </div>
        <div>
          <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">Connect a provider</DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            Sero needs a working model before it can start your welcome session.
          </DialogDescription>
        </div>
      </div>

      {launchNotice ? (
        <div className="rounded-lg border border-status-warning/20 bg-status-warning/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
          {launchNotice}
        </div>
      ) : null}

      {actionableProviders.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/50 p-3">
          <p className="text-xs font-medium text-[var(--text-primary)]">Needs attention</p>
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
        <Button size="sm" onClick={onOpenProviders}>
          <KeyRound className="mr-2 size-3.5" />
          Providers
        </Button>
      </div>
    </div>
  );
}

export function LaunchingScreen({ statusMessage }: { statusMessage?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <CenteredStatusHeader
        step="launching"
        icon={<Loader2 className="size-5 animate-spin text-status-success" />}
        title="Preparing Onboarding"
        description="Sero is saving your model preferences and starting the memory onboarding workflow."
      />
      {statusMessage ? (
        <div className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-center text-xs text-[var(--text-secondary)]">
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
      <CenteredStatusHeader
        step="error"
        icon={<TriangleAlert className="size-5 text-status-warning" />}
        title="Onboarding hit an error"
        description="Something unexpected happened while Sero was preparing your first session."
      />

      {message ? (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-center text-xs text-[var(--text-secondary)]">
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
