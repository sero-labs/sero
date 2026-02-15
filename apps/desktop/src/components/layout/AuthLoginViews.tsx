/**
 * Sub-views for AuthLoginDialog.
 *
 * Split out to keep each file under 500 lines.
 */

import { useState } from 'react';
import {
  CheckCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Loader2,
  LogIn,
  LogOut,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OAuthProviderInfo, ApiKeyProviderInfo } from '@/types/ipc';

// ── Provider list ─────────────────────────────────────────────

export function ProviderListView({
  oauthProviders,
  apiKeyProviders,
  mode,
  onOAuthLogin,
  onApiKeyStart,
  onApiKeyRemove,
  onLogout,
}: {
  oauthProviders: OAuthProviderInfo[];
  apiKeyProviders: ApiKeyProviderInfo[];
  mode: 'login' | 'logout';
  onOAuthLogin: (id: string) => void;
  onApiKeyStart: (id: string, name: string) => void;
  onApiKeyRemove: (id: string) => void;
  onLogout: (id: string) => void;
}) {
  const isLogin = mode === 'login';

  if (isLogin) {
    return (
      <div className="space-y-4">
        {/* OAuth section */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
            OAuth
          </h4>
          <div className="space-y-0.5">
            {oauthProviders.map((p) => (
              <button
                key={p.id}
                onClick={() => onOAuthLogin(p.id)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2
                           text-sm hover:bg-accent transition-colors text-left group"
              >
                <div className="flex items-center gap-2.5">
                  <LogIn className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>{p.name}</span>
                </div>
                {p.isLoggedIn && <AuthBadge />}
              </button>
            ))}
          </div>
        </div>

        {/* API Key section */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
            API Key
          </h4>
          <div className="space-y-0.5">
            {apiKeyProviders.map((p) => (
              <div
                key={p.id}
                className="flex w-full items-center justify-between rounded-md px-3 py-2
                           text-sm hover:bg-accent transition-colors group"
              >
                <button
                  onClick={() => onApiKeyStart(p.id, p.name)}
                  className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                >
                  <Key className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.hasKey && (
                    <>
                      <ApiKeyBadge fromEnv={p.fromEnv} />
                      {!p.fromEnv && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onApiKeyRemove(p.id);
                          }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove API key"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Logout mode — show all providers with credentials
  const loggedInOAuth = oauthProviders.filter((p) => p.isLoggedIn);
  const configuredApiKey = apiKeyProviders.filter((p) => p.hasKey && !p.fromEnv);
  const all = [
    ...loggedInOAuth.map((p) => ({ ...p, kind: 'oauth' as const })),
    ...configuredApiKey.map((p) => ({ ...p, kind: 'apiKey' as const })),
  ];

  if (all.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4 text-center">
        No providers with saved credentials.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {all.map((p) => (
        <button
          key={p.id}
          onClick={() => onLogout(p.id)}
          className="flex w-full items-center justify-between rounded-md px-3 py-2.5
                     text-sm hover:bg-accent transition-colors text-left group"
        >
          <div className="flex items-center gap-2.5">
            <LogOut className="size-4 text-muted-foreground group-hover:text-destructive transition-colors" />
            <span>{p.name}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {p.kind === 'oauth' ? 'OAuth' : 'API key'}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────

function AuthBadge() {
  return (
    <span className="text-xs text-emerald-500 flex items-center gap-1">
      <CheckCircle className="size-3" />
      logged in
    </span>
  );
}

function ApiKeyBadge({ fromEnv }: { fromEnv: boolean }) {
  return (
    <span className="text-xs text-emerald-500 flex items-center gap-1">
      <CheckCircle className="size-3" />
      {fromEnv ? 'env' : 'saved'}
    </span>
  );
}

// ── OAuth views ───────────────────────────────────────────────

export function AuthenticatingView({
  authUrl,
  progressMessages,
  onCancel,
}: {
  authUrl: string | null;
  progressMessages: string[];
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span>Waiting for browser authentication…</span>
      </div>

      {authUrl && (
        <div className="rounded-md border p-3 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            A browser window should have opened. If not, click below:
          </p>
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1.5 break-all"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            Open login page
          </a>
        </div>
      )}

      {progressMessages.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {progressMessages.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onCancel} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

export function WaitingView({ message, onCancel }: { message: string; onCancel: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span>{message}</span>
      </div>
      <Button variant="outline" size="sm" onClick={onCancel} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

// ── Prompt view (OAuth) ───────────────────────────────────────

export function PromptView({
  message,
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
  inputRef,
}: {
  message: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{message}</p>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmit} disabled={!value.trim()} className="flex-1">
          Submit
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── API key entry view ────────────────────────────────────────

export function ApiKeyEntryView({
  providerName,
  value,
  onChange,
  onSave,
  onCancel,
  inputRef,
}: {
  providerName: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Enter API key for <span className="font-medium">{providerName}</span>:
      </p>
      <div className="relative">
        <Input
          ref={inputRef}
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="sk-…"
          className="font-mono text-sm pr-9"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground
                     hover:text-foreground transition-colors rounded"
          tabIndex={-1}
        >
          {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={!value.trim()} className="flex-1">
          Save
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Result view ───────────────────────────────────────────────

export function ResultView({
  type,
  message,
  onDone,
}: {
  type: 'success' | 'error';
  message: string;
  onDone: () => void;
}) {
  const isSuccess = type === 'success';
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-sm">
        {isSuccess ? (
          <CheckCircle className="size-4 text-emerald-500 mt-0.5 shrink-0" />
        ) : (
          <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />
        )}
        <span>{message}</span>
      </div>
      <Button variant="outline" size="sm" onClick={onDone} className="w-full">
        {isSuccess ? 'Done' : 'Back'}
      </Button>
    </div>
  );
}
