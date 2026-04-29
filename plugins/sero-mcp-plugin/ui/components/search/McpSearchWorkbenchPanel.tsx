import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@sero-ai/ui/components/ui/native-select';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, Search, Server } from 'lucide-react';
import type { McpServerSnapshot } from '../../../shared/types';
import { useMcpSearchWorkbench } from '../../hooks/useMcpSearchWorkbench';

export function McpSearchWorkbenchPanel({
  servers,
  selectedServerName,
  onSelectServer,
}: {
  servers: McpServerSnapshot[];
  selectedServerName: string | null;
  onSelectServer: (serverName: string) => void;
}) {
  const promptAgent = useAgentPrompt();
  const search = useMcpSearchWorkbench();

  return (
    <Card className="animate-mcp-fade-in border-border/75 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Search workbench
            </CardTitle>
            <CardDescription>
              Cross-server MCP-only discovery for cached tools and resources. Search here, then jump straight into the matching server detail view for execution, preview, or auth recovery.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={search.clear} disabled={search.loading}>
              Clear
            </Button>
            <Button type="button" size="sm" onClick={() => void search.search()} disabled={search.loading}>
              <Search className="mr-2 h-4 w-4" />
              {search.loading ? 'Searching…' : 'Search MCP'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {search.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>MCP search failed</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{search.error}</p>
              <Button type="button" size="sm" onClick={() => promptAgent(buildSearchHelpPrompt(search.query, search.error ?? 'Unknown MCP search error.', search.serverFilter))}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Ask Sero to help
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <form
          className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_220px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void search.search();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="mcp-search-query">Search query</Label>
            <Input
              id="mcp-search-query"
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
              placeholder="github oauth docs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-search-server-filter">Server scope</Label>
            <NativeSelect
              id="mcp-search-server-filter"
              value={search.serverFilter}
              onChange={(event) => search.setServerFilter(event.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="all">All servers</NativeSelectOption>
              {servers.map((server) => (
                <NativeSelectOption key={server.serverName} value={server.serverName}>
                  {server.serverName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full lg:w-auto" disabled={search.loading}>
              <Search className="mr-2 h-4 w-4" />
              {search.loading ? 'Searching…' : 'Run search'}
            </Button>
          </div>
        </form>

        {!search.lastQuery ? (
          <EmptyState body="Search the cached MCP inventory to find tools or resources across servers, then jump into the right server detail view." />
        ) : search.results.length === 0 ? (
          <EmptyState body={search.summaryText ?? `No MCP tools or resources matched "${search.lastQuery}".`} />
        ) : (
          <div className="space-y-3">
            {search.summaryText && <p className="text-sm text-muted-foreground">{search.summaryText}</p>}
            {search.results.map((match) => {
              const isSelectedServer = selectedServerName === match.serverName;
              return (
                <div key={`${match.kind}:${match.serverName}:${match.uri ?? match.name}`} className="rounded-lg border border-border bg-card/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <ToneBadge label={match.kind} tone={match.kind === 'tool' ? 'default' : 'muted'} />
                        <ToneBadge label={match.serverName} tone="muted" />
                        {match.uiResourceUri && <ToneBadge label="ui capable" tone="warning" />}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{match.name}</div>
                        {match.kind === 'resource' && match.uri && <div className="break-all text-xs text-muted-foreground">{match.uri}</div>}
                        {match.kind === 'tool' && match.uiResourceUri && <div className="break-all text-xs text-muted-foreground">UI resource: {match.uiResourceUri}</div>}
                      </div>
                      {match.description && <p className="text-sm text-muted-foreground">{match.description}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={isSelectedServer ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onSelectServer(match.serverName)}
                      >
                        <Server className="mr-2 h-4 w-4" />
                        {isSelectedServer ? 'Viewing server' : 'Open server'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
      {body}
    </div>
  );
}

function ToneBadge({ label, tone }: { label: string; tone: 'default' | 'warning' | 'muted' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tone === 'default' && 'border-primary/20 bg-primary/5 text-primary',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'muted' && 'border-border bg-background text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  );
}

function buildSearchHelpPrompt(query: string, error: string, serverFilter: string): string {
  return [
    'Help me troubleshoot MCP search in Sero.',
    `Query: ${query || '(empty)'}`,
    `Server filter: ${serverFilter}`,
    '',
    error,
  ].join('\n');
}

export default McpSearchWorkbenchPanel;
