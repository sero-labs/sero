import { useMemo } from 'react';
import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, MonitorSmartphone, ShieldCheck, X } from 'lucide-react';
import type { McpViewerKind, McpViewerState } from '../../hooks/useMcpViewer';
import { McpAuthBrowser } from './McpAuthBrowser';
import { McpResourceViewer } from './McpResourceViewer';

export function McpViewerPane({ viewer }: { viewer: McpViewerState }) {
  const promptAgent = useAgentPrompt();
  const authSession = viewer.authSession;
  const authOrigin = useMemo(() => {
    if (!authSession?.authUrl) {
      return null;
    }
    try {
      return new URL(authSession.authUrl).origin;
    } catch {
      return null;
    }
  }, [authSession?.authUrl]);
  const allowedOrigins = authOrigin ? [authOrigin] : [];
  const activeKind = viewer.pane?.kind ?? null;
  const error = activeKind === 'auth' ? viewer.authError : viewer.resourceError;
  const helpPrompt = buildViewerHelpPrompt({
    kind: activeKind,
    serverName: viewer.pane?.serverName ?? authSession?.serverName ?? viewer.preview?.serverName ?? null,
    error,
    resourceUri: viewer.preview?.resolvedUri ?? viewer.session?.resourceUri ?? viewer.activeResourceUri,
    authOrigin,
  });

  return (
    <Card className="border-border/70 bg-card py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {activeKind === 'auth' ? <ShieldCheck className="size-4 text-primary" /> : <MonitorSmartphone className="size-4 text-primary" />}
              {getPaneTitle(viewer)}
            </CardTitle>
            <CardDescription>{getPaneDescription(activeKind)}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {viewer.pane && <ToneBadge label={viewer.pane.kind} tone="muted" />}
            {viewer.pane?.serverName && <ToneBadge label={viewer.pane.serverName} tone="muted" />}
            {authSession && activeKind !== 'auth' && <ToneBadge label={`auth active for ${authSession.serverName}`} tone="warning" />}
            {viewer.pane && (
              <Button type="button" variant="outline" size="sm" onClick={() => viewer.clearPane()}>
                <X className="mr-2 size-4" />
                Clear pane
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>{activeKind === 'auth' ? 'Auth browser problem' : 'Viewer problem'}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{error}</p>
              <Button type="button" size="sm" onClick={() => promptAgent(helpPrompt)}>
                <LifeBuoy className="mr-2 size-4" />
                Ask Sero to help
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {activeKind === 'auth' ? (
          authSession ? (
            <div className="space-y-3">
              <McpAuthBrowser
                src={authSession.authUrl}
                allowedOrigins={allowedOrigins}
                className="h-[520px]"
                onBlockedNavigation={(url) => viewer.setAuthError(`Blocked auth navigation to ${url}`)}
                onLoadError={viewer.setAuthError}
                onCallbackUrl={(callbackUrl) => {
                  void viewer.completeAuth(authSession.serverName, callbackUrl);
                }}
              />
              <p className="text-xs leading-6 text-muted-foreground">
                Only the active provider origin and the loopback callback are allowed in this embedded browser session.
              </p>
            </div>
          ) : (
            <PanePlaceholder message={viewer.authLoading ? 'Starting authentication session...' : 'Start authentication from an OAuth-backed server to open the sign-in flow here.'} />
          )
        ) : activeKind === 'resource' || activeKind === 'tool-ui' ? (
          <McpResourceViewer preview={viewer.preview} session={viewer.session} loading={viewer.resourceLoading} kind={activeKind} />
        ) : (
          <PanePlaceholder message="Resources, advertised tool UIs, and OAuth sign-in flows open here so you can stay inside Sero while managing MCP servers." />
        )}
      </CardContent>
    </Card>
  );
}

function PanePlaceholder({ message }: { message: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-background/60 p-6 text-center text-base text-muted-foreground">
      <div className="max-w-md">{message}</div>
    </div>
  );
}

function ToneBadge({ label, tone }: { label: string; tone: 'warning' | 'muted' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'muted' && 'border-border bg-background text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  );
}

function getPaneTitle(viewer: McpViewerState): string {
  if (!viewer.pane) {
    return 'Viewer & auth pane';
  }
  if (viewer.pane.kind === 'auth') {
    return viewer.pane.title ?? `Authenticate ${viewer.pane.serverName}`;
  }
  return viewer.pane.title ?? (viewer.pane.kind === 'tool-ui' ? 'Tool UI' : 'Resource preview');
}

function getPaneDescription(kind: McpViewerKind | null): string {
  switch (kind) {
    case 'auth':
      return 'OAuth providers open in a hardened embedded browser so sign-in can complete without leaving Sero.';
    case 'tool-ui':
      return 'Advertised MCP tool UIs render here through loopback AppBridge-style sessions so they can call tools and resources without leaving Sero.';
    case 'resource':
      return 'Discovered MCP resources render here with inline previews for text/image content and interactive hosting for MCP UI resources.';
    default:
      return 'Use the selected server detail view to open resources, launch advertised UIs, or complete OAuth authentication here.';
  }
}

function buildViewerHelpPrompt({
  kind,
  serverName,
  error,
  resourceUri,
  authOrigin,
}: {
  kind: McpViewerKind | null;
  serverName: string | null;
  error: string | null;
  resourceUri: string | null;
  authOrigin: string | null;
}): string {
  return [
    `Help me troubleshoot the MCP ${kind ?? 'viewer'} pane in Sero.`,
    serverName ? `Server: ${serverName}` : 'Server: unknown',
    resourceUri ? `Resource/UI URI: ${resourceUri}` : 'No resource or UI is currently loaded.',
    authOrigin ? `Auth origin: ${authOrigin}` : 'No auth browser origin is active.',
    '',
    error ?? 'Explain the most likely next checks and recovery steps.',
  ].join('\n');
}

export default McpViewerPane;
