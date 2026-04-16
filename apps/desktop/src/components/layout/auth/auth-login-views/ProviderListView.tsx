import { useState } from 'react';
import {
  CheckCircle,
  Key,
  LogIn,
  LogOut,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { ApiKeyProviderInfo, OAuthProviderInfo } from '@/types/ipc';
import {
  getSavedCredentialProviders,
  sortProvidersByPreference,
} from './provider-list-helpers';

interface ProviderListViewProps {
  oauthProviders: OAuthProviderInfo[];
  apiKeyProviders: ApiKeyProviderInfo[];
  mode: 'login' | 'logout';
  preferredProviderId?: string | null;
  onOAuthLogin: (id: string) => void;
  onApiKeyStart: (id: string, name: string) => void;
  onApiKeyRemove: (id: string) => void;
  onLogout: (id: string) => void;
}

export function ProviderListView({
  oauthProviders,
  apiKeyProviders,
  mode,
  preferredProviderId,
  onOAuthLogin,
  onApiKeyStart,
  onApiKeyRemove,
  onLogout,
}: ProviderListViewProps) {
  const isLogin = mode === 'login';
  const [anthropicWarning, setAnthropicWarning] = useState<string | null>(null);

  if (isLogin) {
    return (
      <div className="space-y-4">
        <div>
          <h4 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            OAuth
          </h4>
          <div className="space-y-0.5">
            {sortProvidersByPreference(oauthProviders, preferredProviderId).map((provider) => (
              <button
                key={provider.id}
                onClick={() => {
                  if (provider.id === 'anthropic' && !anthropicWarning) {
                    setAnthropicWarning(provider.id);
                    return;
                  }
                  onOAuthLogin(provider.id);
                }}
                className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-2.5">
                  <LogIn className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  <span>{provider.name}</span>
                  {preferredProviderId === provider.id ? <PreferredProviderBadge /> : null}
                </div>
                {provider.isLoggedIn ? <AuthBadge /> : null}
              </button>
            ))}
          </div>
          {anthropicWarning === 'anthropic' ? (
            <AnthropicWarningBanner
              onContinue={() => {
                setAnthropicWarning(null);
                onOAuthLogin('anthropic');
              }}
              onCancel={() => setAnthropicWarning(null)}
            />
          ) : null}
        </div>

        <div>
          <h4 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            API Key
          </h4>
          <div className="space-y-0.5">
            {sortProvidersByPreference(apiKeyProviders, preferredProviderId).map((provider) => (
              <div
                key={provider.id}
                className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <button
                  onClick={() => {
                    if (provider.id === 'anthropic' && !anthropicWarning) {
                      setAnthropicWarning('anthropic-apikey');
                      return;
                    }
                    onApiKeyStart(provider.id, provider.name);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <Key className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                  <span className="truncate">{provider.name}</span>
                  {preferredProviderId === provider.id ? <PreferredProviderBadge /> : null}
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {provider.hasKey ? (
                    <>
                      <ApiKeyBadge fromEnv={provider.fromEnv} />
                      {!provider.fromEnv ? (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onApiKeyRemove(provider.id);
                          }}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Remove API key"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {anthropicWarning === 'anthropic-apikey' ? (
            <AnthropicWarningBanner
              onContinue={() => {
                setAnthropicWarning(null);
                onApiKeyStart('anthropic', 'Anthropic');
              }}
              onCancel={() => setAnthropicWarning(null)}
            />
          ) : null}
        </div>
      </div>
    );
  }

  const savedProviders = getSavedCredentialProviders(oauthProviders, apiKeyProviders);
  if (savedProviders.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No providers with saved credentials.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {savedProviders.map((provider) => (
        <button
          key={provider.id}
          onClick={() => onLogout(provider.id)}
          className="group flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
        >
          <div className="flex items-center gap-2.5">
            <LogOut className="size-4 text-muted-foreground transition-colors group-hover:text-destructive" />
            <span>{provider.name}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {provider.kind === 'oauth' ? 'OAuth' : 'API key'}
          </span>
        </button>
      ))}
    </div>
  );
}

function AnthropicWarningBanner({
  onContinue,
  onCancel,
}: {
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-1 flex items-start gap-2 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--status-warning)]" />
      <div className="space-y-1.5">
        <p>
          Anthropic may restrict third-party use of consumer subscriptions.
          We recommend using an API key with your own billing account.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onContinue}
            className="text-xs font-medium text-[var(--text-primary)] hover:underline"
          >
            Continue anyway
          </button>
          <button
            onClick={onCancel}
            className="text-xs text-[var(--text-tertiary)] hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PreferredProviderBadge() {
  return (
    <span className="rounded-full border border-[var(--status-warning)]/30 px-1.5 py-0.5 text-[10px] text-[var(--status-warning)]">
      reconnect
    </span>
  );
}

function AuthBadge() {
  return (
    <span className="flex items-center gap-1 text-xs text-[var(--status-success)]">
      <CheckCircle className="size-3" />
      logged in
    </span>
  );
}

function ApiKeyBadge({ fromEnv }: { fromEnv: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs text-[var(--status-success)]">
      <CheckCircle className="size-3" />
      {fromEnv ? 'env' : 'saved'}
    </span>
  );
}
