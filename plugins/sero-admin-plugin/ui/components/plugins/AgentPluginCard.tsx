import { useState } from 'react';
import { openSeroApp } from '@sero-ai/app-runtime';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sero-ai/ui/components/ui/alert-dialog';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { ChevronDown, ChevronUp, Database, FolderOpen, PlugZap, RefreshCw, Trash2 } from 'lucide-react';
import type { InstalledAgentPlugin } from '@sero-ai/common';
import type { AgentPluginsController } from '../../hooks/useAgentPlugins';
import { Band, ComponentGrid, DiagnosticList, MetaLine, componentCounts, diagnosticLookup, looseDiagnostics, mcpRows, skillRows } from './agent-plugin-ui';
import { AgentPluginUpdateReview } from './AgentPluginUpdateReview';

export function AgentPluginCard({
  plugin,
  controller,
  focused = false,
}: {
  plugin: InstalledAgentPlugin;
  controller: AgentPluginsController;
  focused?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = controller.updatePreview?.pluginId === plugin.id ? controller.updatePreview : null;
  const validServers = plugin.mcpServers.filter((server) => server.valid);
  const availableServers = validServers.filter((server) => server.approved);
  const pendingServers = validServers.filter((server) => !server.approved);
  const skipped = plugin.diagnostics.filter((item) => item.level === 'error');
  const reasonFor = diagnosticLookup(plugin.diagnostics);
  const otherDiagnostics = looseDiagnostics(plugin.diagnostics, plugin.skills, plugin.mcpServers);
  const open = expanded || focused;

  return (
    <li className="rounded-lg border border-border/40 bg-background/40">
      <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{plugin.manifest.name}</h4>
            {plugin.manifest.version && <Badge variant="secondary">v{plugin.manifest.version}</Badge>}
            <Badge variant={skipped.length ? 'destructive' : 'outline'}>{skipped.length ? 'Partial failure' : 'Healthy'}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{plugin.manifest.description ?? plugin.source}</p>
          <MetaLine parts={[
            ...componentCounts(plugin.skills, plugin.mcpServers),
            plugin.cli.enabled ? `CLI ${plugin.cli.namespace}` : 'CLI off',
            ...(skipped.length > 0 ? [<span key="skipped" className="text-amber-400">{skipped.length === 1 ? '1 component skipped' : `${skipped.length} components skipped`}</span>] : []),
          ]} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void controller.setEnabled(plugin.id, !plugin.enabled)}>
            {plugin.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={open ? 'Hide details' : 'Show details'}
            title={open ? 'Hide details' : 'Show details'}
            onClick={() => setExpanded(!open)}
          >
            {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>
      </div>

      {open && (
        <>
          <Band>
            <ComponentGrid groups={[
              { label: 'Skills', rows: skillRows(plugin.skills, reasonFor) },
              { label: 'MCP servers', rows: mcpRows(plugin.mcpServers, reasonFor, true) },
            ]} />
          </Band>

          {otherDiagnostics.length > 0 && <Band><DiagnosticList diagnostics={otherDiagnostics} /></Band>}

          {preview && (
            <Band>
              <AgentPluginUpdateReview
                preview={preview}
                onInstall={() => void controller.update(plugin.id, preview.contentDigest, preview.requiresMcpApproval)}
                onDismiss={controller.clearUpdatePreview}
              />
            </Band>
          )}

          <Band className="flex flex-col gap-3">
            {pendingServers.length > 0 && (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => void controller.approve(plugin.id)}>Approve shown MCP definitions</Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Approve to let {pendingServers.map((server) => server.name).join(', ')} run with the definitions shown above.
                </p>
              </div>
            )}
            <AgentPluginCliSettings
              key={plugin.cli.namespace}
              pluginId={plugin.id}
              enabled={plugin.cli.enabled}
              initialNamespace={plugin.cli.namespace}
              controller={controller}
            />
          </Band>

          <Band className="flex flex-wrap items-center gap-2 py-2.5">
            <Button type="button" variant="outline" size="sm" disabled={availableServers.length === 0} onClick={() => void openSeroApp('mcp', { serverName: availableServers[0]!.runtimeName })}><PlugZap className="size-3.5" />Open in MCP</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void controller.reveal(plugin.id, 'package')}><FolderOpen className="size-3.5" />Plugin source</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void controller.reveal(plugin.id, 'data')}><Database className="size-3.5" />Data folder</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void controller.previewUpdate(plugin.id)}><RefreshCw className="size-3.5" />Check for update</Button>
            <div className="ml-auto">
              <AgentPluginRemoveButton plugin={plugin} controller={controller} />
            </div>
          </Band>
        </>
      )}
    </li>
  );
}

function AgentPluginCliSettings({
  pluginId,
  enabled,
  initialNamespace,
  controller,
}: {
  pluginId: string;
  enabled: boolean;
  initialNamespace: string;
  controller: AgentPluginsController;
}) {
  const [namespace, setNamespace] = useState(() => initialNamespace);
  const cliExposureId = `${pluginId}-cli-exposure`;
  const namespaceId = `${pluginId}-cli-namespace`;
  return (
    <div>
      <div className="flex items-center gap-2">
        <Checkbox id={cliExposureId} checked={enabled} onCheckedChange={(checked) => void controller.setCliExposure({ id: pluginId, enabled: checked === true, namespaceAlias: namespace })} />
        <Label htmlFor={cliExposureId} className="text-xs font-normal">Show in Sero CLI</Label>
      </div>
      {enabled && (
        <div className="mt-2 flex items-center gap-2 pl-6">
          <Input id={namespaceId} aria-label="CLI namespace" value={namespace} onChange={(event) => setNamespace(event.target.value)} className="h-8 w-60 font-mono text-xs" />
          <Button type="button" variant="outline" size="sm" disabled={!namespace.trim() || namespace === initialNamespace} onClick={() => void controller.setCliExposure({ id: pluginId, enabled: true, namespaceAlias: namespace })}>Save</Button>
        </div>
      )}
    </div>
  );
}

function AgentPluginRemoveButton({
  plugin,
  controller,
}: {
  plugin: InstalledAgentPlugin;
  controller: AgentPluginsController;
}) {
  const [open, setOpen] = useState(false);
  const [retainData, setRetainData] = useState(true);
  const retainId = `${plugin.id}-retain-data`;
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" />Remove
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {plugin.manifest.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sero removes the package files, its skills and any MCP servers it owns. Other plugins are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2">
            <Checkbox id={retainId} checked={retainData} onCheckedChange={(checked) => setRetainData(checked === true)} className="mt-0.5" />
            <Label htmlFor={retainId} className="flex-col items-start gap-1 text-xs font-normal">
              Keep plugin data
              <span className="text-muted-foreground">Generated state stays on disk for a later reinstall.</span>
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void controller.remove({ id: plugin.id, retainData })}>Remove plugin</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
