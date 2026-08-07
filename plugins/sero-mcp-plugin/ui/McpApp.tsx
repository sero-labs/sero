import { memo, useEffect, useMemo, useState } from 'react';
import {
  consumeAppLaunchParams,
  onAppLaunchParams,
  useAppState,
} from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, FileJson, PlugZap, RefreshCw, Search, Server, ShieldCheck, Wrench } from 'lucide-react';
import type { McpAppState } from '../shared/types';
import { createDefaultMcpState } from '../shared/types';
import { McpRawConfigPanel } from './components/config/McpRawConfigPanel';
import { McpDiagnosticsPanel } from './components/diagnostics/McpDiagnosticsPanel';
import { McpSearchWorkbenchPanel } from './components/search/McpSearchWorkbenchPanel';
import { McpServerCrudPanel } from './components/servers/McpServerCrudPanel';
import { useMcpBootstrap } from './hooks/useMcpBootstrap';
import { useMcpDiagnostics } from './hooks/useMcpDiagnostics';
import { useMcpRawConfig } from './hooks/useMcpRawConfig';
import './styles.css';

// These panels own independent local workflows. Bootstrap, diagnostics, raw
// config, and search state should not redraw the full server manager.
const MemoizedMcpSearchWorkbenchPanel = memo(McpSearchWorkbenchPanel);
const MemoizedMcpServerCrudPanel = memo(McpServerCrudPanel);

export function McpApp() {
  const initialState = useMemo(() => createDefaultMcpState(), []);
  const [state] = useAppState<McpAppState>(initialState);
  const bootstrap = useMcpBootstrap();
  const diagnostics = useMcpDiagnostics();
  const rawConfig = useMcpRawConfig();
  const [selectedServerName, setSelectedServerName] = useState<string | null>(() => {
    const params = consumeAppLaunchParams<{ serverName?: unknown }>('mcp');
    return typeof params?.serverName === 'string' ? params.serverName : null;
  });
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => onAppLaunchParams<{ serverName?: unknown }>('mcp', (params) => {
    if (typeof params.serverName === 'string') setSelectedServerName(params.serverName);
  }), []);

  const resolvedSelectedServerName = useMemo(() => {
    if (selectedServerName && state.servers.some((server) => server.serverName === selectedServerName)) {
      return selectedServerName;
    }
    return null;
  }, [selectedServerName, state.servers]);

  const healthLabel = state.summary.errorServers > 0 ? 'has errors' : state.summary.needsAuthServers > 0 ? 'needs auth' : 'ready';

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <header className="border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <PlugZap className="size-4 text-primary" />
              <h1 className="text-base font-semibold">MCP</h1>
              <Badge variant="secondary">{healthLabel}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <Metric icon={Server} label="Servers" value={state.summary.totalServers} />
              <Metric icon={PlugZap} label="Connected" value={state.summary.connectedServers} />
              <Metric icon={ShieldCheck} label="Needs auth" value={state.summary.needsAuthServers} />
              <Metric icon={AlertCircle} label="Errors" value={state.summary.errorServers} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {state.servers.length > 0 && (
              <Button
                type="button"
                variant={searchOpen ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchOpen((open) => !open)}
                aria-pressed={searchOpen}
              >
                <Search className="mr-2 size-4" />
                Search
              </Button>
            )}
            <Button
              type="button"
              variant={diagnostics.isOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => (diagnostics.isOpen ? diagnostics.close() : void diagnostics.open())}
              disabled={diagnostics.loading}
              aria-pressed={diagnostics.isOpen}
            >
              <Wrench className="mr-2 size-4" />
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
              <FileJson className="mr-2 size-4" />
              Raw config
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void bootstrap.refresh()} disabled={bootstrap.loading}>
              <RefreshCw className={cn('mr-2 size-4', bootstrap.loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-5">
        {bootstrap.error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Bootstrap failed</AlertTitle>
            <AlertDescription>
              <p>{bootstrap.error}</p>
              <p>The plugin could not initialize its MCP config snapshot yet. You can retry after fixing the path or permissions issue.</p>
            </AlertDescription>
          </Alert>
        )}

        <McpDiagnosticsPanel state={diagnostics} />
        <McpRawConfigPanel state={rawConfig} />
        {searchOpen && state.servers.length > 0 && (
          <MemoizedMcpSearchWorkbenchPanel
            servers={state.servers}
            selectedServerName={resolvedSelectedServerName}
            onSelectServer={setSelectedServerName}
          />
        )}
        <MemoizedMcpServerCrudPanel
          servers={state.servers}
          selectedServerName={resolvedSelectedServerName}
          onSelectServerName={setSelectedServerName}
        />
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Server; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5" />
      {label}: <strong className="font-medium text-foreground">{value}</strong>
    </span>
  );
}

export default McpApp;
