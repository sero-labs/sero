import { useMemo, useState, type ReactNode } from 'react';
import { openSeroApp } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
import { Skeleton } from '@sero-ai/ui/components/ui/skeleton';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, ChevronDown, ChevronUp, Pencil, Plus, Power, Save, Server, Trash2, X } from 'lucide-react';
import type { McpServerEditorInput, McpServerSnapshot } from '../../../shared/types';
import {
  createEmptyServerEditorInput,
  createServerEditorInputFromSnapshot,
  validateServerEditorInput,
} from '../../../shared/types';
import { useMcpServerMutations } from '../../hooks/useMcpServerMutations';
import { McpServerDetailPanel } from './McpServerDetailPanel';
import { McpServerProtocolBadges } from './McpServerProtocol';

const QUICK_PRESETS = [
  { label: 'Blank stdio', draft: createPresetDraft({ transport: 'stdio' }) },
  {
    label: 'Filesystem',
    draft: createPresetDraft({
      transport: 'stdio',
      serverName: 'filesystem',
      command: 'npx',
      argsText: '-y\n@modelcontextprotocol/server-filesystem\n.',
      cwd: '.',
      lifecycle: 'keep-alive',
    }),
  },
  {
    label: 'GitHub',
    draft: createPresetDraft({
      transport: 'stdio',
      serverName: 'github',
      command: 'npx',
      argsText: '-y\n@modelcontextprotocol/server-github',
      authMode: 'bearer',
      bearerTokenEnv: 'GITHUB_TOKEN',
      lifecycle: 'eager',
    }),
  },
  {
    label: 'Remote OAuth',
    draft: createPresetDraft({
      transport: 'http',
      serverName: 'remote-oauth',
      url: '',
      authMode: 'oauth',
      lifecycle: 'eager',
    }),
  },
];

export function McpServerCrudPanel({
  servers,
  selectedServerName: controlledSelectedServerName,
  onSelectServerName,
}: {
  servers: McpServerSnapshot[];
  selectedServerName?: string | null;
  onSelectServerName?: (serverName: string | null) => void;
}) {
  const mutations = useMcpServerMutations();
  const [draft, setDraft] = useState<McpServerEditorInput | null>(null);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'user' | 'agent-plugin'>('all');
  const [uncontrolledSelectedServerName, setUncontrolledSelectedServerName] = useState<string | null>(null);

  const sortedServers = useMemo(() => servers
    .filter((server) => sourceFilter === 'all' || (server.source ?? 'user') === sourceFilter)
    .sort((a, b) => a.serverName.localeCompare(b.serverName)), [servers, sourceFilter]);
  const selectedServerName = controlledSelectedServerName ?? uncontrolledSelectedServerName;
  const setSelectedServerName = onSelectServerName ?? setUncontrolledSelectedServerName;
  const validationError = useMemo(() => (draft ? validateServerEditorInput(draft) : null), [draft]);
  const title = draft?.originalServerName ? `Edit ${draft.originalServerName}` : 'Add MCP server';
  const beginDraft = (nextDraft: McpServerEditorInput) => {
    mutations.clearError();
    setSaveAttempted(false);
    setDraft(nextDraft);
  };

  return (
    <Card className="animate-mcp-fade-in border-border/75 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              Servers
            </CardTitle>
            <CardDescription>Add, connect, and inspect MCP servers. Raw JSON stays available for advanced edits.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={sourceFilter}
              onValueChange={(value) => setSourceFilter(value as typeof sourceFilter)}
            >
              <SelectTrigger size="sm" aria-label="Filter servers by source" className="w-auto text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="user">User config</SelectItem>
                <SelectItem value="agent-plugin">Agent Plugins</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={() => beginDraft(createEmptyServerEditorInput())}>
              <Plus className="mr-2 size-4" />
              Add server
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(mutations.error || (saveAttempted && validationError)) && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Server update blocked</AlertTitle>
            <AlertDescription>{(saveAttempted && validationError) || mutations.error}</AlertDescription>
          </Alert>
        )}

        {draft && (
          <div className="rounded-xl border border-border bg-primary/5 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">{title}</div>
                <p className="text-base text-muted-foreground">
                  Use a local command for stdio, or a URL for Streamable HTTP.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
                  <X className="mr-2 size-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={mutations.pendingAction === 'save'}
                  onClick={async () => {
                    setSaveAttempted(true);
                    if (validationError) return;
                    const ok = await mutations.upsertServer(draft);
                    if (ok) {
                      setDraft(null);
                    }
                  }}
                >
                  <Save className="mr-2 size-4" />
                  Save server
                </Button>
              </div>
            </div>

            {!draft.originalServerName && (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-base">
                <span className="text-muted-foreground">Start with</span>
                {QUICK_PRESETS.map((preset) => (
                  <Button key={preset.label} type="button" variant="outline" size="sm" onClick={() => beginDraft({ ...preset.draft })}>
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Server name" htmlFor="mcp-server-name">
                <Input id="mcp-server-name" value={draft.serverName} onChange={(event) => setDraft({ ...draft, serverName: event.target.value })} placeholder="github" />
              </Field>
              <Field label="Transport" htmlFor="mcp-server-transport">
                <Select value={draft.transport} onValueChange={(value) => setDraft({ ...draft, transport: value as McpServerEditorInput['transport'] })}>
                  <SelectTrigger id="mcp-server-transport" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">stdio</SelectItem>
                    <SelectItem value="http">Streamable HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Lifecycle" htmlFor="mcp-server-lifecycle">
                <Select value={draft.lifecycle} onValueChange={(value) => setDraft({ ...draft, lifecycle: value as McpServerEditorInput['lifecycle'] })}>
                  <SelectTrigger id="mcp-server-lifecycle" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lazy">lazy</SelectItem>
                    <SelectItem value="eager">eager</SelectItem>
                    <SelectItem value="keep-alive">keep-alive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Auth" htmlFor="mcp-server-auth">
                <Select value={draft.authMode} onValueChange={(value) => setDraft({ ...draft, authMode: value as McpServerEditorInput['authMode'] })}>
                  <SelectTrigger id="mcp-server-auth" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    <SelectItem value="oauth">oauth</SelectItem>
                    <SelectItem value="bearer">bearer</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {draft.transport === 'stdio' ? (
                <>
                  <Field label="Command" htmlFor="mcp-server-command">
                    <Input id="mcp-server-command" value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} placeholder="npx" />
                  </Field>
                  <Field label="Working directory" htmlFor="mcp-server-cwd">
                    <Input id="mcp-server-cwd" value={draft.cwd} onChange={(event) => setDraft({ ...draft, cwd: event.target.value })} placeholder="/path/to/project" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Server URL" htmlFor="mcp-server-url" className="md:col-span-2">
                    <Input id="mcp-server-url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com/mcp" />
                  </Field>
                  <Field label="Working directory (optional)" htmlFor="mcp-server-cwd">
                    <Input id="mcp-server-cwd" value={draft.cwd} onChange={(event) => setDraft({ ...draft, cwd: event.target.value })} placeholder="/path/to/project" />
                  </Field>
                </>
              )}
              {draft.authMode === 'bearer' && (
                <Field label="Bearer token env var" htmlFor="mcp-server-bearer">
                  <Input id="mcp-server-bearer" value={draft.bearerTokenEnv} onChange={(event) => setDraft({ ...draft, bearerTokenEnv: event.target.value })} placeholder="GITHUB_TOKEN" />
                </Field>
              )}
              {draft.transport === 'stdio' && (
                <Field label="Args (one per line)" htmlFor="mcp-server-args" className="md:col-span-2 xl:col-span-3">
                  <Textarea
                    id="mcp-server-args"
                    value={draft.argsText}
                    onChange={(event) => setDraft({ ...draft, argsText: event.target.value })}
                    className="min-h-28 font-mono text-xs"
                    placeholder="-y\n@modelcontextprotocol/server-github"
                  />
                </Field>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-base text-muted-foreground">
              <Toggle label="Enabled" checked={draft.enabled} onChange={(checked) => setDraft({ ...draft, enabled: checked })} />
              <Toggle label="Expose resources" checked={draft.exposeResources} onChange={(checked) => setDraft({ ...draft, exposeResources: checked })} />
              <Toggle label="Debug stderr" checked={draft.debug} onChange={(checked) => setDraft({ ...draft, debug: checked })} />
            </div>
          </div>
        )}

        <div className="space-y-3">
          {sortedServers.length === 0 ? (
            <EmptyServerSkeleton />
          ) : (
            sortedServers.map((server) => {
              const toggleAction = `${server.enabled ? 'disable' : 'enable'}:${server.serverName}`;
              const connectAction = `${server.connectionStatus === 'connected' ? 'reconnect' : 'connect'}:${server.serverName}`;
              const removeAction = `remove:${server.serverName}`;
              const isExpanded = selectedServerName === server.serverName;
              return (
                <div key={server.serverName} className={cn('rounded-lg border border-border bg-primary/5 p-4', isExpanded && 'border-primary/40')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-foreground">
                            {server.managedByAgentPlugin?.serverName ?? server.serverName}
                          </div>
                          {server.managedByAgentPlugin ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => openAdminAgentPlugin(server.managedByAgentPlugin!.pluginId)}
                            >
                              Managed by Agent Plugin: {server.managedByAgentPlugin.pluginName}
                            </Button>
                          ) : (
                            <Badge variant="secondary">User config</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {server.transport.toUpperCase()} · {server.lifecycle} lifecycle · auth {server.authMode}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {server.enabled && <StatusPill label={server.connectionStatus} tone={server.connectionStatus === 'connected' ? 'success' : server.connectionStatus === 'needs-auth' ? 'warning' : 'muted'} />}
                        {!server.enabled && <StatusPill label="disabled" tone="muted" />}
                        {server.authStatus !== 'not-required' && <StatusPill label={server.authStatus} tone={server.authStatus === 'authenticated' ? 'success' : server.authStatus === 'not-authenticated' ? 'warning' : 'muted'} />}
                        <McpServerProtocolBadges server={server} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Tools: <strong className="text-foreground">{server.toolCount}</strong></span>
                        <span>Resources: <strong className="text-foreground">{server.resourceCount}</strong></span>
                        <span>UI tools: <strong className="text-foreground">{server.uiToolCount}</strong></span>
                        {server.lastConnectedAt && <span>Last connected: <strong className="text-foreground">{formatCompactTimestamp(server.lastConnectedAt)}</strong></span>}
                        {server.lastFailedAt && <span>Last failure: <strong className="text-foreground">{formatCompactTimestamp(server.lastFailedAt)}</strong></span>}
                      </div>
                      {server.lastError && (
                        <div className="max-w-3xl text-xs text-destructive/90">
                          Last error: {server.lastError}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={isExpanded ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedServerName(isExpanded ? null : server.serverName)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronUp className="mr-2 size-4" /> : <ChevronDown className="mr-2 size-4" />}
                        {isExpanded ? 'Hide details' : 'Show details'}
                      </Button>
                      {!server.managedByAgentPlugin && (
                        <Button type="button" variant="outline" size="sm" onClick={() => beginDraft(createServerEditorInputFromSnapshot(server))}>
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!server.enabled || mutations.pendingAction === connectAction}
                        onClick={() => void mutations.connectServer(server.serverName, server.connectionStatus === 'connected')}
                      >
                        <Server className="mr-2 size-4" />
                        {server.connectionStatus === 'connected' ? 'Reconnect' : 'Connect'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={mutations.pendingAction === toggleAction} onClick={() => void mutations.toggleServer(server.serverName, !server.enabled)}>
                        <Power className="mr-2 size-4" />
                        {server.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      {!server.managedByAgentPlugin && (
                          <Button type="button" variant="outline" size="sm" disabled={mutations.pendingAction === removeAction} onClick={() => void mutations.removeServer(server.serverName)}>
                            <Trash2 className="mr-2 size-4" />
                            Remove
                          </Button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 border-t border-border/75 pt-4">
                      <McpServerDetailPanel server={server} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyServerSkeleton() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 p-4" aria-label="No current MCP servers">
      <div className="mb-3 text-base font-medium text-muted-foreground">No current MCP servers</div>
      <div className="space-y-2" aria-hidden="true">
        <div className="rounded-lg border border-border/60 bg-background/30 p-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-56 max-w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
            <div className="hidden gap-2 sm:flex">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-2 text-base text-muted-foreground', className)}>
      <Label htmlFor={htmlFor} className="block font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function StatusPill({ label, tone }: { label: string; tone: 'default' | 'success' | 'warning' | 'muted' }) {
  const className = cn(
    tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    tone === 'muted' && 'border-border bg-muted text-muted-foreground',
  );
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function formatCompactTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function openAdminAgentPlugin(pluginId: string): void {
  void openSeroApp('admin', { agentPluginId: pluginId });
}

function createPresetDraft(input: Partial<McpServerEditorInput> & { transport: McpServerEditorInput['transport'] }): McpServerEditorInput {
  const base = createEmptyServerEditorInput();
  return {
    ...base,
    authMode: input.transport === 'http' ? 'oauth' : 'none',
    lifecycle: input.transport === 'http' ? 'eager' : 'lazy',
    ...input,
  };
}

export default McpServerCrudPanel;
