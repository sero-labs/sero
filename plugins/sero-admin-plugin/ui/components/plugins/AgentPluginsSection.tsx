import { useState } from 'react';
import { FolderOpen, PackageSearch } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import type { AgentPluginsController } from '../../hooks/useAgentPlugins';
import { getSero } from '../../hooks/host';
import { AgentPluginCard } from './AgentPluginCard';
import { AgentPluginInstallReview } from './AgentPluginInstallReview';
import { PluginSection, SectionHeader } from './section-ui';

export function AgentPluginsSection({
  controller,
  focusedPluginId,
}: {
  controller: AgentPluginsController;
  focusedPluginId?: string | null;
}) {
  const [source, setSource] = useState('');
  const [approveExecutable, setApproveExecutable] = useState(false);
  const [exposeToCli, setExposeToCli] = useState(false);
  const [namespace, setNamespace] = useState('');

  const inspect = async () => {
    const result = await controller.inspect(source);
    if (result?.suggestedNamespace) setNamespace(result.suggestedNamespace);
  };

  const install = async () => {
    const result = await controller.install({
      source,
      approveExecutableComponents: approveExecutable,
      exposeToCli,
      namespaceAlias: namespace || undefined,
    });
    if (result) {
      setSource('');
      setApproveExecutable(false);
      setExposeToCli(false);
      controller.clearInspection();
    }
  };

  return (
    <PluginSection>
      <SectionHeader
        icon={PackageSearch}
        title="Agent Plugins"
        description="Portable Agent Skills and MCP servers. Agent Plugins stay separate from Sero apps and never create sidebar entries."
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-2 @xl:flex-row">
          <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="npm:package, git URL, or absolute local directory" className="h-9 flex-1 text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={async () => {
            const folder = await getSero().workspace.pickFolder();
            if (folder) setSource(folder);
          }}><FolderOpen className="mr-2 size-4" />Browse</Button>
          <Button type="button" size="sm" disabled={!source.trim() || controller.busy} onClick={() => void inspect()}>Inspect source</Button>
        </div>

        {controller.error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{controller.error}</div>}

        {controller.inspection && (
          <AgentPluginInstallReview
            inspection={controller.inspection}
            approveExecutable={approveExecutable}
            exposeToCli={exposeToCli}
            namespace={namespace}
            busy={controller.busy}
            onApproveExecutableChange={setApproveExecutable}
            onExposeToCliChange={setExposeToCli}
            onNamespaceChange={setNamespace}
            onInstall={() => void install()}
            onCancel={controller.clearInspection}
          />
        )}

        {controller.loading ? (
          <p className="py-5 text-center text-xs text-muted-foreground">Loading Agent Plugins…</p>
        ) : controller.plugins.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 p-6 text-center"><p className="text-sm font-medium">No Agent Plugins installed</p><p className="mt-1 text-xs text-muted-foreground">Inspect a portable package before installation.</p></div>
        ) : (
          <ul className="space-y-2">{controller.plugins.map((plugin) => <AgentPluginCard key={plugin.id} plugin={plugin} controller={controller} focused={plugin.id === focusedPluginId} />)}</ul>
        )}
      </div>
    </PluginSection>
  );
}
