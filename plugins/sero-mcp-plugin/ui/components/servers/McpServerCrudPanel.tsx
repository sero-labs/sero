import { useMemo, useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Input } from '@sero-ai/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@sero-ai/ui/components/ui/native-select';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, Pencil, Plus, Power, Save, Server, Trash2, X } from 'lucide-react';
import type { McpServerEditorInput, McpServerSnapshot } from '../../../shared/types';
import {
  createEmptyServerEditorInput,
  createServerEditorInputFromSnapshot,
  validateServerEditorInput,
} from '../../../shared/types';
import { useMcpServerMutations } from '../../hooks/useMcpServerMutations';

export function McpServerCrudPanel({ servers }: { servers: McpServerSnapshot[] }) {
  const mutations = useMcpServerMutations();
  const [draft, setDraft] = useState<McpServerEditorInput | null>(null);

  const sortedServers = useMemo(() => [...servers].sort((a, b) => a.serverName.localeCompare(b.serverName)), [servers]);
  const validationError = useMemo(() => (draft ? validateServerEditorInput(draft) : null), [draft]);
  const title = draft?.originalServerName ? `Edit ${draft.originalServerName}` : 'Add MCP server';

  return (
    <Card className="animate-mcp-fade-in py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              Servers
            </CardTitle>
            <CardDescription>
              Forms-first MCP server management. Configure stdio or HTTP/SSE servers here without dropping into raw JSON.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setDraft(createEmptyServerEditorInput())}>
            <Plus className="mr-2 h-4 w-4" />
            Add server
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(mutations.error || validationError) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Server update blocked</AlertTitle>
            <AlertDescription>{validationError ?? mutations.error}</AlertDescription>
          </Alert>
        )}

        {draft && (
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">{title}</div>
                <p className="text-sm text-muted-foreground">
                  Use command + args for stdio servers, or a URL for HTTP/SSE servers. Auth can stay off, OAuth, or bearer-token based.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={mutations.pendingAction === 'save' || !!validationError}
                  onClick={async () => {
                    const ok = await mutations.upsertServer(draft);
                    if (ok) {
                      setDraft(null);
                    }
                  }}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save server
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Server name">
                <Input value={draft.serverName} onChange={(event) => setDraft({ ...draft, serverName: event.target.value })} placeholder="github" />
              </Field>
              <Field label="Transport">
                <NativeSelect value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value as McpServerEditorInput['transport'] })} className="w-full">
                  <NativeSelectOption value="stdio">stdio</NativeSelectOption>
                  <NativeSelectOption value="http">http / sse</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field label="Lifecycle">
                <NativeSelect value={draft.lifecycle} onChange={(event) => setDraft({ ...draft, lifecycle: event.target.value as McpServerEditorInput['lifecycle'] })} className="w-full">
                  <NativeSelectOption value="lazy">lazy</NativeSelectOption>
                  <NativeSelectOption value="eager">eager</NativeSelectOption>
                  <NativeSelectOption value="keep-alive">keep-alive</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field label="Auth">
                <NativeSelect value={draft.authMode} onChange={(event) => setDraft({ ...draft, authMode: event.target.value as McpServerEditorInput['authMode'] })} className="w-full">
                  <NativeSelectOption value="none">none</NativeSelectOption>
                  <NativeSelectOption value="oauth">oauth</NativeSelectOption>
                  <NativeSelectOption value="bearer">bearer</NativeSelectOption>
                </NativeSelect>
              </Field>
              {draft.transport === 'stdio' ? (
                <>
                  <Field label="Command">
                    <Input value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} placeholder="npx" />
                  </Field>
                  <Field label="Working directory">
                    <Input value={draft.cwd} onChange={(event) => setDraft({ ...draft, cwd: event.target.value })} placeholder="/path/to/project" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Server URL" className="md:col-span-2">
                    <Input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com/mcp" />
                  </Field>
                  <Field label="Working directory (optional)">
                    <Input value={draft.cwd} onChange={(event) => setDraft({ ...draft, cwd: event.target.value })} placeholder="/path/to/project" />
                  </Field>
                </>
              )}
              {draft.authMode === 'bearer' && (
                <Field label="Bearer token env var">
                  <Input value={draft.bearerTokenEnv} onChange={(event) => setDraft({ ...draft, bearerTokenEnv: event.target.value })} placeholder="GITHUB_TOKEN" />
                </Field>
              )}
              {draft.transport === 'stdio' && (
                <Field label="Args (one per line)" className="md:col-span-2 xl:col-span-3">
                  <Textarea
                    value={draft.argsText}
                    onChange={(event) => setDraft({ ...draft, argsText: event.target.value })}
                    className="min-h-28 font-mono text-xs"
                    placeholder="-y\n@modelcontextprotocol/server-github"
                  />
                </Field>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <Toggle label="Enabled" checked={draft.enabled} onChange={(checked) => setDraft({ ...draft, enabled: checked })} />
              <Toggle label="Expose resources" checked={draft.exposeResources} onChange={(checked) => setDraft({ ...draft, exposeResources: checked })} />
              <Toggle label="Debug stderr" checked={draft.debug} onChange={(checked) => setDraft({ ...draft, debug: checked })} />
            </div>
          </div>
        )}

        <div className="space-y-3">
          {sortedServers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              No MCP servers yet. Add one above to start building the plugin’s global MCP config.
            </div>
          ) : (
            sortedServers.map((server) => {
              const toggleAction = `${server.enabled ? 'disable' : 'enable'}:${server.serverName}`;
              const removeAction = `remove:${server.serverName}`;
              return (
                <div key={server.serverName} className="rounded-lg border border-border bg-card/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{server.serverName}</div>
                      <div className="text-xs text-muted-foreground">
                        {server.transport.toUpperCase()} · {server.lifecycle} lifecycle · auth {server.authMode}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <StatusPill label={server.enabled ? 'enabled' : 'disabled'} tone={server.enabled ? 'default' : 'muted'} />
                        <StatusPill label={server.connectionStatus} tone={server.connectionStatus === 'needs-auth' ? 'warning' : 'muted'} />
                        <StatusPill label={server.authStatus} tone={server.authStatus === 'authenticated' ? 'success' : server.authStatus === 'not-authenticated' ? 'warning' : 'muted'} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setDraft(createServerEditorInputFromSnapshot(server))}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={mutations.pendingAction === toggleAction} onClick={() => void mutations.toggleServer(server.serverName, !server.enabled)}>
                        <Power className="mr-2 h-4 w-4" />
                        {server.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={mutations.pendingAction === removeAction} onClick={() => void mutations.removeServer(server.serverName)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('space-y-2 text-sm text-muted-foreground', className)}>
      <span className="block font-medium text-foreground">{label}</span>
      {children}
    </label>
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

export default McpServerCrudPanel;
