import { useState } from 'react';
import { openSeroApp } from '@sero-ai/app-runtime';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ChevronDown, ChevronUp, Database, FolderOpen, PlugZap, RefreshCw, Trash2 } from 'lucide-react';
import type { InstalledAgentPlugin } from '@sero-ai/common';
import type { AgentPluginsController } from '../../hooks/useAgentPlugins';

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
  const [retainData, setRetainData] = useState(true);
  const preview = controller.updatePreview?.pluginId === plugin.id ? controller.updatePreview : null;
  const validSkills = plugin.skills.filter((skill) => skill.valid);
  const validServers = plugin.mcpServers.filter((server) => server.valid);
  const availableServers = validServers.filter((server) => server.approved);
  const errors = plugin.diagnostics.filter((item) => item.level === 'error');

  return (
    <li className="rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{plugin.manifest.name}</h4>
            {plugin.manifest.version && <Badge variant="secondary">v{plugin.manifest.version}</Badge>}
            <Badge variant={errors.length ? 'destructive' : 'outline'}>{errors.length ? 'Partial failure' : 'Healthy'}</Badge>
            <Badge variant="outline">Agent Plugin</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{plugin.manifest.description ?? plugin.source}</p>
          <p className="mt-1 text-xs text-muted-foreground">{validSkills.length} skills · {validServers.length} MCP servers · CLI {plugin.cli.enabled ? plugin.cli.namespace : 'off'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void controller.setEnabled(plugin.id, !plugin.enabled)}>
            {plugin.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ChevronUp className="mr-2 size-4" /> : <ChevronDown className="mr-2 size-4" />}
            {expanded ? 'Hide details' : 'Details'}
          </Button>
        </div>
      </div>

      {(expanded || focused) && (
        <div className="mt-4 space-y-4 border-t border-border/50 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ComponentList title="Skills" rows={plugin.skills.map((skill) => ({ name: skill.name, detail: skill.valid ? 'Valid Agent Skill' : 'Invalid' }))} />
            <ComponentList title="MCP servers" rows={plugin.mcpServers.map((server) => ({ name: server.name, detail: `${server.transport} · ${server.valid ? server.approved ? 'approved' : 'approval needed' : 'invalid'}` }))} />
          </div>

          {plugin.diagnostics.length > 0 && (
            <div className="rounded-md border border-border/60 p-3 text-xs">
              <strong>Diagnostics</strong>
              <ul className="mt-2 space-y-1">
                {plugin.diagnostics.map((item) => <li key={`${item.component}:${item.componentName ?? ''}:${item.message}`} className={item.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{item.componentName ? `${item.componentName}: ` : ''}{item.message}</li>)}
              </ul>
            </div>
          )}

          {plugin.mcpServers.some((server) => server.valid && server.transport === 'stdio' && !server.approved) && (
            <Button type="button" size="sm" onClick={() => void controller.approve(plugin.id)}>Approve local MCP execution</Button>
          )}

          <AgentPluginCliSettings
            key={plugin.cli.namespace}
            pluginId={plugin.id}
            enabled={plugin.cli.enabled}
            initialNamespace={plugin.cli.namespace}
            commandSummary={plugin.cli.skillCommands.concat(plugin.cli.mcpCommands).join(' · ')}
            controller={controller}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={availableServers.length === 0} onClick={() => void openSeroApp('mcp', { serverName: availableServers[0]!.runtimeName })}><PlugZap className="mr-2 size-4" />Open owned servers in MCP</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void controller.reveal(plugin.id, 'package')}><FolderOpen className="mr-2 size-4" />Package</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void controller.reveal(plugin.id, 'data')}><Database className="mr-2 size-4" />Data</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void controller.previewUpdate(plugin.id)}><RefreshCw className="mr-2 size-4" />Review update</Button>
          </div>

          {preview && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
              <strong>Update review {preview.previousVersion ?? 'unversioned'} → {preview.nextVersion ?? 'unversioned'}</strong>
              <p>Added: {preview.addedComponents.join(', ') || 'none'} · Removed: {preview.removedComponents.join(', ') || 'none'} · Changed: {preview.changedComponents.join(', ') || 'none'}</p>
              <p>CLI added: {preview.addedCliCommands.join(', ') || 'none'} · CLI removed: {preview.removedCliCommands.join(', ') || 'none'}</p>
              {preview.requiresExecutableApproval && <p className="text-amber-400">This update changes executable capability and needs renewed approval.</p>}
              <Button type="button" size="sm" onClick={() => void controller.update(plugin.id, preview.requiresExecutableApproval)}>Install reviewed update</Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={retainData} onChange={(event) => setRetainData(event.target.checked)} />Retain PLUGIN_DATA</label>
            <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => void controller.remove({ id: plugin.id, retainData })}><Trash2 className="mr-2 size-4" />Remove Agent Plugin</Button>
          </div>
        </div>
      )}
    </li>
  );
}

function AgentPluginCliSettings({
  pluginId,
  enabled,
  initialNamespace,
  commandSummary,
  controller,
}: {
  pluginId: string;
  enabled: boolean;
  initialNamespace: string;
  commandSummary: string;
  controller: AgentPluginsController;
}) {
  const [namespace, setNamespace] = useState(() => initialNamespace);
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(event) => void controller.setCliExposure({ id: pluginId, enabled: event.target.checked, namespaceAlias: namespace })} />Expose through Sero CLI</label>
        <Input value={namespace} onChange={(event) => setNamespace(event.target.value)} disabled={!enabled} className="h-8 max-w-56 font-mono text-xs" />
        {enabled && <Button type="button" variant="outline" size="sm" onClick={() => void controller.setCliExposure({ id: pluginId, enabled: true, namespaceAlias: namespace })}>Save namespace</Button>}
      </div>
      {enabled && <p className="text-xs text-muted-foreground">{commandSummary || 'No valid components are exposed.'}</p>}
    </div>
  );
}

function ComponentList({ title, rows }: { title: string; rows: Array<{ name: string; detail: string }> }) {
  return <div className="rounded-md border border-border/60 p-3"><strong className="text-xs">{title}</strong><ul className="mt-2 space-y-1 text-xs">{rows.length ? rows.map((row) => <li key={row.name} className="flex justify-between gap-2"><span>{row.name}</span><span className="text-muted-foreground">{row.detail}</span></li>) : <li className="text-muted-foreground">None</li>}</ul></div>;
}
