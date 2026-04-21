import { useMemo } from 'react';
import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, MonitorSmartphone, RefreshCw, ScrollText } from 'lucide-react';
import type { McpServerSnapshot } from '../../../shared/types';
import { useMcpViewer } from '../../hooks/useMcpViewer';
import { McpServerAuthPanel } from './McpServerAuthPanel';
import { McpServerToolRunnerPanel } from './McpServerToolRunnerPanel';
import { McpViewerPane } from '../viewer/McpViewerPane';

export function McpServerDetailPanel({ server }: { server: McpServerSnapshot | null }) {
  const promptAgent = useAgentPrompt();
  const viewer = useMcpViewer();
  const sortedResources = useMemo(() => [...(server?.resources ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [server?.resources]);
  const sortedUiTools = useMemo(() => [...(server?.uiTools ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [server?.uiTools]);

  if (!server) {
    return (
      <Card className="animate-mcp-fade-in py-4">
        <CardHeader>
          <CardTitle>Server details</CardTitle>
          <CardDescription>Select a configured server to inspect its resources, UI-capable tools, and live preview details.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const helpPrompt = buildServerHelpPrompt(server, viewer.resourceError, viewer.preview?.serverName === server.serverName ? viewer.preview : null);

  return (
    <Card className="animate-mcp-fade-in py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              {server.serverName} details
            </CardTitle>
            <CardDescription>
              Inspect discovered MCP resources and UI-capable tools. Resources, tool UIs, and auth flows now open in the dedicated viewer pane so you can troubleshoot without leaving context.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <ToneBadge label={server.connectionStatus} tone={server.connectionStatus === 'connected' ? 'success' : server.connectionStatus === 'needs-auth' ? 'warning' : 'muted'} />
            <ToneBadge label={server.authStatus} tone={server.authStatus === 'authenticated' ? 'success' : server.authStatus === 'not-authenticated' ? 'warning' : 'muted'} />
            <ToneBadge label={`${server.toolCount} tools`} tone="muted" />
            <ToneBadge label={`${server.resourceCount} resources`} tone="muted" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {viewer.resourceError && viewer.pane?.serverName === server.serverName && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Resource or UI preview failed</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{viewer.resourceError}</p>
              <Button type="button" size="sm" onClick={() => promptAgent(helpPrompt)}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Ask Sero to help
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
          <section className="space-y-4">
            <McpServerAuthPanel server={server} viewer={viewer} />

            <McpServerToolRunnerPanel
              server={server}
              onOpenResource={(resourceUri, options) => {
                void viewer.openResource(server.serverName, resourceUri, options);
              }}
            />

            <Card className="border-border/70 bg-muted/15 py-4">
              <CardHeader>
                <CardTitle className="text-base">Resources</CardTitle>
                <CardDescription>
                  Cached from the last successful metadata refresh. Click a resource to lazy-connect the server if needed and preview its current content in the viewer pane.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedResources.length === 0 ? (
                  <EmptyState title="No resources discovered" body="Connect the server and refresh metadata if you expect resources here." />
                ) : (
                  sortedResources.map((resource) => {
                    const isActive = viewer.pane?.kind === 'resource'
                      && viewer.pane.serverName === server.serverName
                      && viewer.activeResourceUri === resource.uri;
                    return (
                      <div key={resource.uri} className={cn('rounded-lg border border-border bg-background/60 p-3', isActive && 'border-primary/40 bg-primary/5')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="font-medium text-foreground">{resource.name}</div>
                            <div className="break-all text-xs text-muted-foreground">{resource.uri}</div>
                            {resource.description && <p className="text-xs text-muted-foreground">{resource.description}</p>}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={isActive ? 'default' : 'outline'}
                            onClick={() => void viewer.openResource(server.serverName, resource.uri, { kind: 'resource', title: resource.name })}
                            disabled={viewer.resourceLoading && isActive}
                          >
                            <RefreshCw className={cn('mr-2 h-4 w-4', viewer.resourceLoading && isActive && 'animate-spin')} />
                            {isActive ? 'Reload' : 'Preview'}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-muted/15 py-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MonitorSmartphone className="h-4 w-4 text-primary" />
                  UI-capable tools
                </CardTitle>
                <CardDescription>
                  Tools that advertised MCP UI metadata. Launching a tool reads its advertised UI resource and opens it in the viewer pane.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedUiTools.length === 0 ? (
                  <EmptyState title="No UI-capable tools discovered" body="If this server exposes interactive MCP UIs, reconnect it and refresh metadata to repopulate the cache." />
                ) : (
                  sortedUiTools.map((tool) => {
                    const isActive = viewer.pane?.kind === 'tool-ui'
                      && viewer.pane.serverName === server.serverName
                      && viewer.activeResourceUri === tool.resourceUri;
                    return (
                      <div key={tool.name} className={cn('rounded-lg border border-border bg-background/60 p-3', isActive && 'border-primary/40 bg-primary/5')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="font-medium text-foreground">{tool.name}</div>
                            <div className="break-all text-xs text-muted-foreground">{tool.resourceUri}</div>
                            {tool.description && <p className="text-sm text-muted-foreground">{tool.description}</p>}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={isActive ? 'default' : 'outline'}
                            onClick={() => void viewer.openResource(server.serverName, tool.resourceUri, { kind: 'tool-ui', title: tool.name })}
                            disabled={viewer.resourceLoading && isActive}
                          >
                            <MonitorSmartphone className="mr-2 h-4 w-4" />
                            {isActive ? 'Reload UI' : 'Launch UI'}
                          </Button>
                        </div>
                        <pre className="mt-3 overflow-x-auto rounded-md border border-border/70 bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
                          {formatSchemaSummary(tool.inputSchema)}
                        </pre>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </section>

          <McpViewerPane viewer={viewer} />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-4">
      <div className="font-medium text-foreground">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function ToneBadge({ label, tone }: { label: string; tone: 'success' | 'warning' | 'muted' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'muted' && 'border-border bg-background text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  );
}

function formatSchemaSummary(schema: unknown): string {
  if (!schema) {
    return '(no schema reported)';
  }
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return String(schema);
  }
}

function buildServerHelpPrompt(
  server: McpServerSnapshot,
  error: string | null,
  preview: { resolvedUri: string } | null,
): string {
  return [
    `Help me troubleshoot MCP resource or UI viewing for server "${server.serverName}" in Sero.`,
    `Connection status: ${server.connectionStatus}`,
    `Auth status: ${server.authStatus}`,
    `Resources discovered: ${server.resourceCount}`,
    preview ? `Current resource URI: ${preview.resolvedUri}` : 'No resource preview is open.',
    '',
    error ?? 'No explicit viewer error was present; explain likely next checks and recovery steps.',
  ].join('\n');
}

export default McpServerDetailPanel;
