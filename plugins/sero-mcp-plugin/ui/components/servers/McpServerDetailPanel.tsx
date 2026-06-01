import { useMemo } from 'react';
import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, MonitorSmartphone, RefreshCw } from 'lucide-react';
import type { McpServerSnapshot } from '../../../shared/types';
import { useMcpViewer } from '../../hooks/useMcpViewer';
import { McpServerAuthPanel } from './McpServerAuthPanel';
import { McpServerToolRunnerPanel } from './McpServerToolRunnerPanel';
import { McpViewerPane } from '../viewer/McpViewerPane';

export function McpServerDetailPanel({ server }: { server: McpServerSnapshot }) {
  const promptAgent = useAgentPrompt();
  const viewer = useMcpViewer();
  const sortedResources = useMemo(() => [...server.resources].sort((a, b) => a.name.localeCompare(b.name)), [server.resources]);
  const sortedUiTools = useMemo(() => [...server.uiTools].sort((a, b) => a.name.localeCompare(b.name)), [server.uiTools]);

  const helpPrompt = buildServerHelpPrompt(server, viewer.resourceError, viewer.preview?.serverName === server.serverName ? viewer.preview : null);

  return (
    <div className="space-y-4">
      {viewer.resourceError && viewer.pane?.serverName === server.serverName && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Resource or UI preview failed</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{viewer.resourceError}</p>
            <Button type="button" size="sm" onClick={() => promptAgent(helpPrompt)}>
              <LifeBuoy className="mr-2 size-4" />
              Ask Sero to help
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <section className="min-w-0 space-y-4">
            <McpServerAuthPanel server={server} viewer={viewer} />

            <McpServerToolRunnerPanel
              server={server}
              onOpenResource={(resourceUri, options) => {
                void viewer.openResource(server.serverName, resourceUri, options);
              }}
            />

            <Card className="border-border/70 bg-card py-4">
              <CardHeader>
                <CardTitle className="text-base">Resources</CardTitle>
                <CardDescription>
                  Cached from the last successful metadata refresh. Standard resources open as inline previews, while `ui://` resources launch an interactive loopback viewer session in the pane.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedResources.length === 0 ? (
                  <EmptyState title="No resources discovered" body="Connect the server and refresh metadata if you expect resources here." />
                ) : (
                  sortedResources.map((resource) => {
                    const isUiResource = resource.uri.startsWith('ui://');
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
                            <RefreshCw className={cn('mr-2 size-4', viewer.resourceLoading && isActive && 'animate-spin')} />
                            {isActive ? (isUiResource ? 'Reload UI' : 'Reload') : (isUiResource ? 'Open UI' : 'Preview')}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card py-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MonitorSmartphone className="size-4 text-primary" />
                  UI-capable tools
                </CardTitle>
                <CardDescription>
                  Tools that advertised MCP UI metadata. Launching a tool now hosts its advertised UI resource in a loopback AppBridge-style viewer session inside Sero.
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
                            onClick={() => void viewer.openResource(server.serverName, tool.resourceUri, { kind: 'tool-ui', title: tool.name, toolName: tool.name })}
                            disabled={viewer.resourceLoading && isActive}
                          >
                            <MonitorSmartphone className="mr-2 size-4" />
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

        <div className="min-w-0">
          <McpViewerPane viewer={viewer} />
        </div>
      </div>
    </div>
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
