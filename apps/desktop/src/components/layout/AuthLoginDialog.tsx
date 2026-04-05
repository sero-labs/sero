/**
 * Auth login dialog — OAuth + API key management.
 *
 * Self-contained component that drives OAuth login flows and API key
 * entry. Communicates with the main process via `window.sero.auth.*`.
 *
 * Usage:
 *   <AuthLoginDialog open={open} onOpenChange={setOpen} onComplete={refreshModels} />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import type { OAuthProviderInfo, ApiKeyProviderInfo, OAuthEvent } from '@/types/ipc';
import {
  ProviderListView,
  AuthenticatingView,
  WaitingView,
  PromptView,
  ApiKeyEntryView,
  ResultView,
} from './AuthLoginViews';

// ── Types ────────────────────────────────────────────────────

type DialogPhase =
  | 'providers'       // Provider list (initial)
  | 'authenticating'  // Browser opened, waiting for OAuth
  | 'prompt'          // Waiting for user text input (OAuth)
  | 'manual_input'    // Waiting for redirect URL paste (OAuth)
  | 'waiting'         // Polling (e.g. GitHub Copilot)
  | 'api_key_entry'   // Entering an API key
  | 'success'
  | 'error';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful login, API key save, or logout. */
  onComplete?: () => void;
  /** Start in logout mode. */
  mode?: 'login' | 'logout';
  /** Optionally highlight a provider that needs attention. */
  preferredProviderId?: string | null;
}

// ── Component ────────────────────────────────────────────────

export function AuthLoginDialog({
  open,
  onOpenChange,
  onComplete,
  mode = 'login',
  preferredProviderId = null,
}: Props) {
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderInfo[]>([]);
  const [apiKeyProviders, setApiKeyProviders] = useState<ApiKeyProviderInfo[]>([]);
  const [phase, setPhase] = useState<DialogPhase>('providers');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedProviderName, setSelectedProviderName] = useState('');
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [promptMessage, setPromptMessage] = useState('');
  const [promptPlaceholder, setPromptPlaceholder] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load providers ──────────────────────────────────────────
  const loadProviders = useCallback(async () => {
    try {
      const { oauth, apiKey } = await window.sero.auth.getProviders();
      setOauthProviders(oauth);
      setApiKeyProviders(apiKey);
    } catch {
      setOauthProviders([]);
      setApiKeyProviders([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setPhase('providers');
      setSelectedProvider(null);
      setSelectedProviderName('');
      setAuthUrl(null);
      setInputValue('');
      setStatusMessage('');
      setProgressMessages([]);
      loadProviders();
    }
  }, [open, loadProviders]);

  // ── Subscribe to OAuth events ───────────────────────────────
  useEffect(() => {
    if (!open) return;

    const unsub = window.sero.auth.onEvent((event: OAuthEvent) => {
      switch (event.type) {
        case 'auth':
          setAuthUrl(event.url);
          setPhase('authenticating');
          if (event.instructions) {
            setProgressMessages((prev) => [...prev, event.instructions!]);
          }
          break;
        case 'prompt':
          setPromptMessage(event.message);
          setPromptPlaceholder(event.placeholder ?? '');
          setInputValue('');
          setPhase('prompt');
          setTimeout(() => inputRef.current?.focus(), 50);
          break;
        case 'manual_input':
          setPromptMessage(event.prompt);
          setInputValue('');
          setPhase('manual_input');
          setTimeout(() => inputRef.current?.focus(), 50);
          break;
        case 'waiting':
          setStatusMessage(event.message);
          setPhase('waiting');
          break;
        case 'progress':
          setProgressMessages((prev) => [...prev, event.message]);
          break;
        case 'success':
          setStatusMessage(event.message);
          setPhase('success');
          loadProviders();
          onComplete?.();
          break;
        case 'error':
          setStatusMessage(event.message);
          setPhase('error');
          break;
        case 'cancelled':
          setPhase('providers');
          break;
      }
    });

    return unsub;
  }, [open, loadProviders, onComplete]);

  // ── Cancel on close ─────────────────────────────────────────
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (phase === 'authenticating' || phase === 'prompt' || phase === 'manual_input' || phase === 'waiting')) {
        window.sero.auth.cancel();
      }
      onOpenChange(next);
    },
    [phase, onOpenChange],
  );

  // ── OAuth actions ───────────────────────────────────────────
  const handleOAuthLogin = useCallback((providerId: string) => {
    setSelectedProvider(providerId);
    setProgressMessages([]);
    window.sero.auth.login(providerId);
  }, []);

  const handleLogout = useCallback(
    async (providerId: string) => {
      try {
        await window.sero.auth.logout(providerId);
        await loadProviders();
        onComplete?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMessage(`Failed to logout: ${msg}`);
        setPhase('error');
      }
    },
    [loadProviders, onComplete],
  );

  const handleSubmitPrompt = useCallback(() => {
    if (!inputValue.trim()) return;
    window.sero.auth.respondPrompt(inputValue.trim());
    setInputValue('');
    setPhase('authenticating');
  }, [inputValue]);

  const handleSubmitManualCode = useCallback(() => {
    if (!inputValue.trim()) return;
    window.sero.auth.respondManualCode(inputValue.trim());
    setInputValue('');
    setPhase('authenticating');
  }, [inputValue]);

  const handleOAuthCancel = useCallback(() => {
    window.sero.auth.cancel();
    setPhase('providers');
  }, []);

  // ── API key actions ─────────────────────────────────────────
  const handleApiKeyStart = useCallback((providerId: string, providerName: string) => {
    setSelectedProvider(providerId);
    setSelectedProviderName(providerName);
    setInputValue('');
    setPhase('api_key_entry');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleApiKeySave = useCallback(async () => {
    if (!inputValue.trim() || !selectedProvider) return;
    try {
      await window.sero.auth.setApiKey(selectedProvider, inputValue.trim());
      setStatusMessage(`API key saved for ${selectedProviderName}.`);
      setPhase('success');
      await loadProviders();
      onComplete?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Failed to save API key: ${msg}`);
      setPhase('error');
    }
  }, [inputValue, selectedProvider, selectedProviderName, loadProviders, onComplete]);

  const handleApiKeyRemove = useCallback(
    async (providerId: string) => {
      try {
        await window.sero.auth.removeApiKey(providerId);
        await loadProviders();
        onComplete?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMessage(`Failed to remove API key: ${msg}`);
        setPhase('error');
      }
    },
    [loadProviders, onComplete],
  );

  // ── Render ──────────────────────────────────────────────────
  const isLogin = mode === 'login';
  const title = isLogin ? 'Provider Authentication' : 'Logout from Provider';
  const description = isLogin
    ? 'Login via OAuth or add an API key to access models.'
    : 'Remove saved credentials for a provider.';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {phase === 'providers' && (
            <ProviderListView
              oauthProviders={oauthProviders}
              apiKeyProviders={apiKeyProviders}
              mode={mode}
              preferredProviderId={preferredProviderId}
              onOAuthLogin={handleOAuthLogin}
              onApiKeyStart={handleApiKeyStart}
              onApiKeyRemove={handleApiKeyRemove}
              onLogout={handleLogout}
            />
          )}

          {phase === 'authenticating' && (
            <AuthenticatingView
              authUrl={authUrl}
              progressMessages={progressMessages}
              onCancel={handleOAuthCancel}
            />
          )}

          {phase === 'waiting' && (
            <WaitingView message={statusMessage} onCancel={handleOAuthCancel} />
          )}

          {(phase === 'prompt' || phase === 'manual_input') && (
            <PromptView
              message={promptMessage}
              placeholder={promptPlaceholder}
              value={inputValue}
              onChange={setInputValue}
              onSubmit={phase === 'prompt' ? handleSubmitPrompt : handleSubmitManualCode}
              onCancel={handleOAuthCancel}
              inputRef={inputRef}
            />
          )}

          {phase === 'api_key_entry' && (
            <ApiKeyEntryView
              providerName={selectedProviderName}
              value={inputValue}
              onChange={setInputValue}
              onSave={handleApiKeySave}
              onCancel={() => setPhase('providers')}
              inputRef={inputRef}
            />
          )}

          {phase === 'success' && (
            <ResultView type="success" message={statusMessage} onDone={() => setPhase('providers')} />
          )}

          {phase === 'error' && (
            <ResultView type="error" message={statusMessage} onDone={() => setPhase('providers')} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
