/**
 * Auth screen — token entry with auto-connect from stored token.
 */

import { useState, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { cn } from '@/lib/cn';
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
      <div className="w-[360px] bg-card border border-border rounded-xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Connect to Sero</h2>
            <p className="text-sm text-muted-foreground">Enter your gateway auth token</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Auth token"
            autoFocus
            disabled={isConnecting}
            className={cn(
              'w-full bg-background border border-input rounded-lg px-3 py-2.5',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
              'disabled:opacity-50',
            )}
          />

          {authError && (
            <p className="text-sm text-destructive">{authError}</p>
          )}

          <button
            type="submit"
            disabled={isConnecting || !tokenInput.trim()}
            className={cn(
              'w-full rounded-lg px-4 py-2.5 text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center justify-center gap-2',
            )}
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
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
