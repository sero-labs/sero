import { useMemo } from 'react';
import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, MonitorSmartphone, RefreshCw, ScrollText, X } from 'lucide-react';
import type { McpResourcePreview, McpServerSnapshot } from '../../../shared/types';
import { useMcpResourceReader } from '../../hooks/useMcpResourceReader';
import { McpServerAuthPanel } from './McpServerAuthPanel';

export function McpServerDetailPanel({ server }: { server: McpServerSnapshot | null }) {
  const promptAgent = useAgentPrompt();
  const resourceReader = useMcpResourceReader();
  const preview = resourceReader.preview?.serverName === server?.serverName ? resourceReader.preview : null;
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

  const helpPrompt = buildServerHelpPrompt(server, resourceReader.error, preview);

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
              Inspect discovered MCP resources and UI-capable tools. Resource previews stay inside Sero so you can troubleshoot without leaving context.
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
        {resourceReader.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Resource preview failed</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{resourceReader.error}</p>
              <Button type="button" size="sm" onClick={() => promptAgent(helpPrompt)}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Ask Sero to help
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
          <section className="space-y-4">
            <McpServerAuthPanel server={server} />

            <Card className="border-border/70 bg-muted/15 py-4">
              <CardHeader>
                <CardTitle className="text-base">Resources</CardTitle>
                <CardDescription>
                  Cached from the last successful metadata refresh. Click a resource to lazy-connect the server if needed and preview its current content.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedResources.length === 0 ? (
                  <EmptyState title="No resources discovered" body="Connect the server and refresh metadata if you expect resources here." />
                ) : (
                  sortedResources.map((resource) => {
                    const isActive = resourceReader.activeResourceUri === resource.uri;
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
                            onClick={() => void resourceReader.loadResource(server.serverName, resource.uri)}
                            disabled={resourceReader.loading && isActive}
                          >
                            <RefreshCw className={cn('mr-2 h-4 w-4', resourceReader.loading && isActive && 'animate-spin')} />
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
                  Tools that advertised MCP UI metadata. Full interactive UI launching is the next slice; for now this view exposes what the server reported.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedUiTools.length === 0 ? (
                  <EmptyState title="No UI-capable tools discovered" body="If this server exposes interactive MCP UIs, reconnect it and refresh metadata to repopulate the cache." />
                ) : (
                  sortedUiTools.map((tool) => (
                    <div key={tool.name} className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="font-medium text-foreground">{tool.name}</div>
                      {tool.description && <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>}
                      <pre className="mt-3 overflow-x-auto rounded-md border border-border/70 bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
                        {formatSchemaSummary(tool.inputSchema)}
                      </pre>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <Card className="border-border/70 bg-muted/15 py-4">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Embedded resource preview</CardTitle>
                  <CardDescription>
                    Current preview renders directly in the MCP app. HTML resources are sandboxed in an iframe; text and JSON resources stay copyable.
                  </CardDescription>
                </div>
                {preview && (
                  <Button type="button" variant="outline" size="sm" onClick={resourceReader.clearPreview}>
                    <X className="mr-2 h-4 w-4" />
                    Clear preview
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ResourcePreview preview={preview} loading={resourceReader.loading} />
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

function ResourcePreview({ preview, loading }: { preview: McpResourcePreview | null; loading: boolean }) {
  if (loading && !preview) {
    return <PreviewPlaceholder body="Loading resource preview…" />;
  }
  if (!preview) {
    return <PreviewPlaceholder body="Select a discovered resource to preview it here." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <ToneBadge label={preview.previewKind} tone="muted" />
        <ToneBadge label={preview.mimeType ?? 'unknown mime'} tone="muted" />
        <span className="rounded-full border border-border bg-background px-2 py-0.5">{preview.resolvedUri}</span>
        {preview.truncated && <ToneBadge label="preview truncated" tone="warning" />}
      </div>

      {preview.previewKind === 'html' ? (
        <iframe
          title={preview.resolvedUri}
          srcDoc={preview.html ?? ''}
          sandbox="allow-scripts allow-forms"
          className="h-[520px] w-full rounded-lg border border-border bg-white"
        />
      ) : preview.previewKind === 'image' ? (
        <div className="overflow-hidden rounded-lg border border-border bg-background p-3">
          {preview.dataUrl ? (
            <img src={preview.dataUrl} alt={preview.resolvedUri} className="max-h-[520px] w-full object-contain" />
          ) : (
            <PreviewPlaceholder body="This image resource did not return a renderable payload." />
          )}
        </div>
      ) : preview.previewKind === 'binary' ? (
        <PreviewPlaceholder body="This resource returned binary content that cannot be previewed inline yet." />
      ) : (
        <pre className="max-h-[520px] overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-6 text-muted-foreground">
          {preview.text || '(empty resource)'}
        </pre>
      )}
    </div>
  );
}

function PreviewPlaceholder({ body }: { body: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
      <div className="max-w-md">{body}</div>
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
  preview: McpResourcePreview | null,
): string {
  return [
    `Help me troubleshoot MCP resource viewing for server "${server.serverName}" in Sero.`,
    `Connection status: ${server.connectionStatus}`,
    `Auth status: ${server.authStatus}`,
    `Resources discovered: ${server.resourceCount}`,
    preview ? `Current resource URI: ${preview.resolvedUri}` : 'No resource preview is open.',
    '',
    error ?? 'No explicit reader error was present; explain likely next checks and recovery steps.',
  ].join('\n');
}

export default McpServerDetailPanel;
