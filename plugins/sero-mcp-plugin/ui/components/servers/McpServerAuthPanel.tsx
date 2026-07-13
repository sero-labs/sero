import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import type { McpServerSnapshot } from '../../../shared/types';
import type { McpViewerState } from '../../hooks/useMcpViewer';

export function McpServerAuthPanel({
  server,
  viewer,
}: {
  server: McpServerSnapshot;
  viewer: McpViewerState;
}) {
  const promptAgent = useAgentPrompt();
  const isOAuth = server.authMode === 'oauth';
  const activeSession = viewer.authSession?.serverName === server.serverName ? viewer.authSession : null;
  const authPaneActive = viewer.pane?.kind === 'auth' && viewer.pane.serverName === server.serverName;
  const authError = viewer.pane?.serverName === server.serverName || activeSession ? viewer.authError : null;
  const helpPrompt = buildAuthHelpPrompt(server, authError, activeSession?.authUrl ?? null, authPaneActive);

  if (!isOAuth) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-muted/15 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" />
              OAuth authentication
            </CardTitle>
            <CardDescription>
              Authenticate this MCP server entirely inside Sero. The active sign-in flow opens in the dedicated viewer pane instead of a popup or external browser.
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
          <Button type="button" size="sm" disabled={viewer.authLoading} onClick={() => void viewer.startAuth(server.serverName)}>
            {viewer.authLoading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
            {server.authStatus === 'authenticated' ? 'Re-authenticate' : 'Authenticate'}
          </Button>
          {activeSession && !authPaneActive && (
            <Button type="button" variant="outline" size="sm" disabled={viewer.authLoading} onClick={viewer.focusAuthSession}>
              <ShieldCheck className="mr-2 size-4" />
              Show auth browser
            </Button>
          )}
          {activeSession && (
            <Button type="button" variant="outline" size="sm" disabled={viewer.authLoading} onClick={() => void viewer.cancelAuth(server.serverName)}>
              <X className="mr-2 size-4" />
              Cancel auth
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={viewer.authLoading} onClick={() => void viewer.clearAuth(server.serverName)}>
            <X className="mr-2 size-4" />
            Clear saved auth
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!authError} onClick={() => promptAgent(helpPrompt)}>
            <LifeBuoy className="mr-2 size-4" />
            Ask Sero to help
          </Button>
        </div>

        {authError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>OAuth flow error</AlertTitle>
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}

        {activeSession ? (
          <div className="rounded-lg border border-border bg-background/60 p-4 text-base text-muted-foreground">
            {authPaneActive
              ? 'The provider sign-in flow is open in the viewer pane. Complete it there and Sero will finish the loopback callback automatically.'
              : 'An authentication session is active for this server. Open the auth browser in the viewer pane to continue the sign-in flow.'}
          </div>
        ) : !authError && server.authStatus !== 'authenticated' ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-base text-muted-foreground">
            Start authentication to open the provider sign-in flow in the viewer pane. When the provider redirects back to the loopback callback, Sero will complete the exchange automatically.
          </div>
        ) : null}
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

function buildAuthHelpPrompt(
  server: McpServerSnapshot,
  error: string | null,
  authUrl: string | null,
  authPaneActive: boolean,
): string {
  return [
    `Help me troubleshoot OAuth authentication for MCP server "${server.serverName}" in Sero.`,
    `Connection status: ${server.connectionStatus}`,
    `Auth status: ${server.authStatus}`,
    authUrl ? `Current auth URL origin: ${safeOrigin(authUrl)}` : 'No auth browser is currently open.',
    authPaneActive ? 'The auth browser is already open in the viewer pane.' : 'The auth browser is not currently focused in the viewer pane.',
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
