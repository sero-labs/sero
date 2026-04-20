import { useMemo, type ComponentType } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, PlugZap, RefreshCw, Server, ShieldCheck, Wrench } from 'lucide-react';
import type { McpAppState } from '../shared/types';
import { createDefaultMcpState } from '../shared/types';
import { McpRawConfigPanel } from './components/config/McpRawConfigPanel';
import { McpDiagnosticsPanel } from './components/diagnostics/McpDiagnosticsPanel';
import { useMcpBootstrap } from './hooks/useMcpBootstrap';
import { useMcpDiagnostics } from './hooks/useMcpDiagnostics';
import { useMcpRawConfig } from './hooks/useMcpRawConfig';
import './styles.css';

export function McpApp() {
  const initialState = useMemo(() => createDefaultMcpState(), []);
  const [state] = useAppState<McpAppState>(initialState);
  const bootstrap = useMcpBootstrap();
  const diagnostics = useMcpDiagnostics();
  const rawConfig = useMcpRawConfig();

  const summaryCards = useMemo(() => {
    return [
      { label: 'Servers', value: state.summary.totalServers, icon: Server },
      { label: 'Connected', value: state.summary.connectedServers, icon: PlugZap },
      { label: 'Needs auth', value: state.summary.needsAuthServers, icon: ShieldCheck },
      { label: 'Errors', value: state.summary.errorServers, icon: AlertCircle },
    ];
  }, [state.summary.connectedServers, state.summary.errorServers, state.summary.needsAuthServers, state.summary.totalServers]);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-primary" />
              <h1 className="text-base font-semibold">MCP</h1>
              <Badge variant="secondary">foundation</Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Sero-native MCP management is now scaffolded. The plugin can bootstrap its state, maintain Sero-aware
              config paths, and surface configured servers while deeper lifecycle, auth, and viewer features are built.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void diagnostics.open()} disabled={diagnostics.loading}>
              <AlertCircle className="mr-2 h-4 w-4" />
              Diagnostics
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void rawConfig.open()} disabled={rawConfig.loading || rawConfig.saving}>
              <Wrench className="mr-2 h-4 w-4" />
              Raw config
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void bootstrap.refresh()} disabled={bootstrap.loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', bootstrap.loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-5">
        {bootstrap.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Bootstrap failed</AlertTitle>
            <AlertDescription>
              <p>{bootstrap.error}</p>
              <p>The plugin could not initialize its MCP config snapshot yet. You can retry after fixing the path or permissions issue.</p>
            </AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="animate-mcp-fade-in gap-3 py-4">
                <CardHeader className="px-4">
                  <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wide">
                    <Icon className="h-3.5 w-3.5" />
                    {card.label}
                  </CardDescription>
                  <CardTitle className="text-3xl">{card.value}</CardTitle>
                </CardHeader>
              </Card>
            );
          })}
        </section>

        <McpDiagnosticsPanel state={diagnostics} />
        <McpRawConfigPanel state={rawConfig} />

        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          {state.firstRun ? (
            <Card className="animate-mcp-fade-in py-4">
              <CardHeader>
                <CardTitle>Start with a first MCP server</CardTitle>
                <CardDescription>
                  The plugin has created its config and state files. Next slices will add the full setup wizard,
                  forms-first server creation, and in-plugin auth/resource flows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Config path: <span className="font-mono text-foreground">{state.configPath ?? 'pending bootstrap'}</span>
                </p>
                <p>
                  Current defaults: idle timeout <strong>{state.settings.idleTimeout}m</strong>, tool prefix{' '}
                  <strong>{state.settings.toolPrefix}</strong>.
                </p>
                <p>
                  For now, you can refresh this view after editing the config file manually while the CRUD UI is under construction.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="animate-mcp-fade-in py-4">
              <CardHeader>
                <CardTitle>Configured servers</CardTitle>
                <CardDescription>
                  Snapshot-backed server inventory from the new MCP plugin state file.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.servers.map((server) => (
                  <div key={server.serverName} className="rounded-lg border border-border bg-card/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{server.serverName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {server.transport.toUpperCase()} · {server.lifecycle} lifecycle
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={server.enabled ? 'default' : 'outline'}>{server.enabled ? 'Enabled' : 'Disabled'}</Badge>
                        <StatusBadge label={server.connectionStatus} />
                        <StatusBadge label={server.authStatus} />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="animate-mcp-fade-in py-4">
            <CardHeader>
              <CardTitle>Current foundation slice</CardTitle>
              <CardDescription>What is implemented so far.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <FeatureRow icon={Wrench} title="Plugin scaffold" body="Built-in plugin manifest, remote UI wiring, and extension entry point are in place." />
              <FeatureRow icon={Server} title="Sero-aware storage" body="State, config, metadata cache, and OAuth token paths now resolve through Sero-aware helpers with Pi fallback behavior." />
              <FeatureRow icon={PlugZap} title="Bootstrap + status" body="The MCP app can bootstrap its config snapshot, and the bridged mcp tool can report basic status/list output." />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className={cn('rounded-full border px-2 py-0.5 font-medium', getStatusTone(label))}>
      {label}
    </span>
  );
}

function getStatusTone(label: string): string {
  switch (label) {
    case 'connected':
    case 'authenticated':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'not-authenticated':
    case 'needs-auth':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'disabled':
      return 'border-border bg-muted text-muted-foreground';
    default:
      return 'border-primary/20 bg-primary/5 text-primary';
  }
}

export default McpApp;
