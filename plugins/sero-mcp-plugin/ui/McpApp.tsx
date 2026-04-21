import { useMemo, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, PlugZap, RefreshCw, Server, ShieldCheck, Wrench } from 'lucide-react';
import type { McpAppState } from '../shared/types';
import { createDefaultMcpState } from '../shared/types';
import { McpRawConfigPanel } from './components/config/McpRawConfigPanel';
import { McpDiagnosticsPanel } from './components/diagnostics/McpDiagnosticsPanel';
import { McpSearchWorkbenchPanel } from './components/search/McpSearchWorkbenchPanel';
import { McpServerCrudPanel } from './components/servers/McpServerCrudPanel';
import { McpSetupWizard } from './components/wizard/McpSetupWizard';
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
  const [selectedServerName, setSelectedServerName] = useState<string | null>(null);

  const resolvedSelectedServerName = useMemo(() => {
    if (selectedServerName && state.servers.some((server) => server.serverName === selectedServerName)) {
      return selectedServerName;
    }
    return null;
  }, [selectedServerName, state.servers]);

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-primary" />
              <h1 className="text-base font-semibold">MCP</h1>
              <Badge variant="secondary">connected</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={diagnostics.isOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => (diagnostics.isOpen ? diagnostics.close() : void diagnostics.open())}
              disabled={diagnostics.loading}
              aria-pressed={diagnostics.isOpen}
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              Diagnostics
            </Button>
            <Button
              type="button"
              variant={rawConfig.isOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => (rawConfig.isOpen ? rawConfig.close() : void rawConfig.open())}
              disabled={rawConfig.loading || rawConfig.saving}
              aria-pressed={rawConfig.isOpen}
            >
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="animate-mcp-fade-in gap-3 border-border/75 py-4">
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
        {state.servers.length > 0 && (
          <McpSearchWorkbenchPanel
            servers={state.servers}
            selectedServerName={resolvedSelectedServerName}
            onSelectServer={setSelectedServerName}
          />
        )}
        <McpServerCrudPanel
          servers={state.servers}
          selectedServerName={resolvedSelectedServerName}
          onSelectServerName={setSelectedServerName}
        />

        {state.firstRun && (
          <McpSetupWizard
            configPath={state.configPath}
            settings={state.settings}
            onCreated={setSelectedServerName}
          />
        )}
      </div>
    </div>
  );
}

export default McpApp;
