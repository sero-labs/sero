/**
 * Auth screen — token entry with auto-connect from stored token.
 */

import { useState, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { Button } from '@sero/ui/components/ui/button';
import { Input } from '@sero/ui/components/ui/input';
import { Loader2, Lock } from 'lucide-react';

export function AuthScreen() {
  const [tokenInput, setTokenInput] = useState('');
  const connect = useConnectionStore((s) => s.connect);
  const state = useConnectionStore((s) => s.state);
  const authError = useConnectionStore((s) => s.authError);

  const isConnecting = state === 'connecting' || state === 'authenticating';

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

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <div className="w-[360px] max-w-[90vw] bg-card border border-border rounded-xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <Lock className="w-5 h-5 text-muted-foreground" />
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
            autoFocus
            disabled={isConnecting}
          />

          {authError && (
            <p className="text-sm text-destructive">{authError}</p>
          )}

          <Button
            type="submit"
            disabled={isConnecting || !tokenInput.trim()}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Connecting...
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
