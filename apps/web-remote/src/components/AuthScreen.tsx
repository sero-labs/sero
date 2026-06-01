/**
 * Connection screen, token entry plus reconnect state for saved pairings.
 */

import { useState, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Loader2, Lock } from 'lucide-react';

interface AuthScreenProps {
  mode: 'auth' | 'reconnecting';
  statusMessage?: string | null;
}

export function AuthScreen({ mode, statusMessage }: AuthScreenProps) {
  const [tokenInput, setTokenInput] = useState('');
  const connect = useConnectionStore((s) => s.connect);
  const retry = useConnectionStore((s) => s.retry);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const state = useConnectionStore((s) => s.state);
  const authError = useConnectionStore((s) => s.authError);

  const isConnecting = state === 'connecting' || state === 'authenticating';
  const isReconnecting = state === 'reconnecting';

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = tokenInput.trim();
      if (trimmed) {
        connect(trimmed);
      }
    },
    [tokenInput, connect],
  );

  if (mode === 'reconnecting') {
    const title = authError ? 'Connect to Sero' : 'Reconnecting to Sero';
    const description = authError
      ? 'Your saved token needs to be replaced.'
      : 'Using your saved device token.';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="w-[360px] max-w-[90vw] rounded-xl border border-border bg-card p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {statusMessage ?? 'Trying to restore your previous connection now.'}
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <Button onClick={retry} disabled={isConnecting} className="w-full">
              {isConnecting ? 'Retrying...' : isReconnecting ? 'Reconnect Now' : 'Retry Now'}
            </Button>
            <Button onClick={disconnect} variant="outline" className="w-full">
              Use Different Token
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <div className="w-[360px] max-w-[90vw] bg-card border border-border rounded-xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-lg bg-accent flex items-center justify-center">
            <Lock className="size-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Connect to Sero</h2>
            <p className="text-sm text-muted-foreground">Enter your gateway auth token</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Auth token"
            disabled={isConnecting}
          />

          {authError && (
            <p className="text-sm text-destructive">{authError}</p>
          )}
          {!authError && statusMessage && (
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          )}

          <Button
            type="submit"
            disabled={isConnecting || !tokenInput.trim()}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Connecting…
              </>
            ) : (
              'Connect'
            )}
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground text-center">
          Find your token in the Sero desktop app settings
          <br />
          or run <code className="text-foreground/80">cat ~/.sero-ui/gateway-token</code>
        </p>
      </div>
    </div>
  );
}
