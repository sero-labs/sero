import { useMemo } from 'react';
import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import type { McpServerSnapshot } from '../../../shared/types';
import { useMcpAuthFlow } from '../../hooks/useMcpAuthFlow';
import { McpAuthBrowser } from '../viewer/McpAuthBrowser';

export function McpServerAuthPanel({ server }: { server: McpServerSnapshot }) {
  const promptAgent = useAgentPrompt();
  const authFlow = useMcpAuthFlow();
  const isOAuth = server.authMode === 'oauth';
  const activeSession = authFlow.session?.serverName === server.serverName ? authFlow.session : null;
  const allowedOrigins = useMemo(() => {
    if (!activeSession?.authUrl) return [];
    try {
      return [new URL(activeSession.authUrl).origin];
    } catch {
      return [];
    }
  }, [activeSession?.authUrl]);
  const helpPrompt = buildAuthHelpPrompt(server, authFlow.error, activeSession?.authUrl ?? null);

  if (!isOAuth) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-muted/15 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              OAuth authentication
            </CardTitle>
            <CardDescription>
              Authenticate this MCP server entirely inside Sero. The browser rail is hardened and only allows the active auth origin plus the loopback callback.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <StatusBadge label={server.authStatus} tone={server.authStatus === 'authenticated' ? 'success' : server.authStatus === 'authenticating' ? 'default' : 'warning'} />
            <StatusBadge label={server.connectionStatus} tone={server.connectionStatus === 'connected' ? 'success' : server.connectionStatus === 'needs-auth' ? 'warning' : 'muted'} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={authFlow.loading} onClick={() => void authFlow.startAuth(server.serverName)}>
            {authFlow.loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {server.authStatus === 'authenticated' ? 'Re-authenticate' : 'Authenticate'}
          </Button>
          {activeSession && (
            <Button type="button" variant="outline" size="sm" disabled={authFlow.loading} onClick={() => void authFlow.cancelAuth(server.serverName)}>
              <X className="mr-2 h-4 w-4" />
              Cancel auth
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={!authFlow.error} onClick={() => promptAgent(helpPrompt)}>
            <LifeBuoy className="mr-2 h-4 w-4" />
            Ask Sero to help
          </Button>
        </div>

        {authFlow.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>OAuth flow error</AlertTitle>
            <AlertDescription>{authFlow.error}</AlertDescription>
          </Alert>
        )}

        <div className={cn(activeSession ? 'block' : 'hidden')}>
          <McpAuthBrowser
            src={activeSession?.authUrl ?? null}
            allowedOrigins={allowedOrigins}
            className="h-[460px]"
            onBlockedNavigation={(url) => authFlow.setError(`Blocked auth navigation to ${url}`)}
            onLoadError={(message) => authFlow.setError(message)}
            onCallbackUrl={(callbackUrl) => {
              void authFlow.completeAuth(server.serverName, callbackUrl);
            }}
          />
        </div>

        {!activeSession && !authFlow.error && server.authStatus !== 'authenticated' && (
          <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            Start authentication to open the provider sign-in flow in an embedded browser. When the provider redirects back to the loopback callback, Sero will complete the exchange automatically.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'default' | 'success' | 'warning' | 'muted' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tone === 'default' && 'border-primary/20 bg-primary/5 text-primary',
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'muted' && 'border-border bg-background text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  );
}

function buildAuthHelpPrompt(server: McpServerSnapshot, error: string | null, authUrl: string | null): string {
  return [
    `Help me troubleshoot OAuth authentication for MCP server "${server.serverName}" in Sero.`,
    `Connection status: ${server.connectionStatus}`,
    `Auth status: ${server.authStatus}`,
    authUrl ? `Current auth URL origin: ${safeOrigin(authUrl)}` : 'No auth browser is currently open.',
    '',
    error ?? 'Explain the most likely next checks and recovery steps.',
  ].join('\n');
}

function safeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

export default McpServerAuthPanel;
