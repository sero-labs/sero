import { Button } from '@sero-ai/ui/components/ui/button';
import type { AgentPluginUpdatePreview } from '@sero-ai/common';
import { formatMcpDefinition } from './agent-plugin-mcp';

/** Component changes an update brings, shown before it is installed. */
export function AgentPluginUpdateReview({
  preview,
  onInstall,
  onDismiss,
}: {
  preview: AgentPluginUpdatePreview;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const changes = [
    ...preview.addedComponents.map((name) => `+ ${name}`),
    ...preview.changedComponents.map((name) => `~ ${name}`),
    ...preview.removedComponents.map((name) => `− ${name}`),
  ];
  const cliChanges = [
    ...preview.addedCliCommands.map((name) => `+ ${name}`),
    ...preview.removedCliCommands.map((name) => `− ${name}`),
  ];

  // An empty component list does not mean the source is unchanged — the
  // manifest or files outside the component set may still differ, so the
  // install action always stays available.
  const unchanged = changes.length === 0 && cliChanges.length === 0;

  return (
    <div className="text-xs">
      <h5 className="font-medium">{unchanged ? 'Update review' : 'Update available'} · {preview.previousVersion ?? 'unversioned'} → {preview.nextVersion ?? 'unversioned'}</h5>
      {unchanged ? (
        <p className="mt-1.5 text-muted-foreground">No skill, MCP or Sero CLI changes. Other package files may still differ.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-muted-foreground">
          {changes.map((change) => <li key={change}>{change}</li>)}
          {cliChanges.map((change) => <li key={`cli:${change}`}>{change} (Sero CLI)</li>)}
        </ul>
      )}
      {preview.requiresMcpApproval && (
        <div className="mt-2">
          <p className="text-amber-400">This update changes MCP access and needs renewed approval.</p>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-muted-foreground">
            {preview.mcpServers.length > 0
              ? preview.mcpServers.map((server) => <li key={server.name}>{server.name}: {formatMcpDefinition(server)}</li>)
              : <li>No MCP definitions remain.</li>}
          </ul>
        </div>
      )}
      <div className="mt-2.5 flex gap-2">
        <Button type="button" size="sm" onClick={onInstall}>Install update</Button>
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>Dismiss</Button>
      </div>
    </div>
  );
}
