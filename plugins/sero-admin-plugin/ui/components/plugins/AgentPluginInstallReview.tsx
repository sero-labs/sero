import { TriangleAlert } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import type { AgentPluginInspection } from '@sero-ai/common';

export function AgentPluginInstallReview({
  inspection,
  approveExecutable,
  exposeToCli,
  namespace,
  busy,
  onApproveExecutableChange,
  onExposeToCliChange,
  onNamespaceChange,
  onInstall,
  onCancel,
}: {
  inspection: AgentPluginInspection;
  approveExecutable: boolean;
  exposeToCli: boolean;
  namespace: string;
  busy: boolean;
  onApproveExecutableChange: (value: boolean) => void;
  onExposeToCliChange: (value: boolean) => void;
  onNamespaceChange: (value: string) => void;
  onInstall: () => void;
  onCancel: () => void;
}) {
  const validSkills = inspection.skills.filter((skill) => skill.valid);
  const validServers = inspection.mcpServers.filter((server) => server.valid);
  const stdioCount = validServers.filter((server) => server.transport === 'stdio').length;
  const remoteCount = validServers.length - stdioCount;
  return (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{inspection.manifest?.name ?? 'Invalid package'}</h4>
            {inspection.manifest?.version && <Badge variant="secondary">v{inspection.manifest.version}</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{inspection.manifest?.description ?? 'Review portable components before installation.'}</p>
        </div>
        <Badge variant={inspection.valid ? 'default' : 'destructive'}>{inspection.valid ? 'Ready to install' : 'Invalid manifest'}</Badge>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <ComponentSummary label="Skills" value={validSkills.length} />
        <ComponentSummary label="Local MCP executables" value={stdioCount} />
        <ComponentSummary label="Remote MCP endpoints" value={remoteCount} />
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p><strong>Install only from sources you trust.</strong> Skills can direct the agent. MCP servers can connect to services or run commands on this machine.</p>
      </div>

      {inspection.diagnostics.length > 0 && (
        <ul className="space-y-1 rounded-md border border-border/60 bg-background/60 p-3 text-xs">
          {inspection.diagnostics.map((item) => (
            <li key={`${item.component}:${item.componentName ?? ''}:${item.message}`} className={item.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
              {item.componentName ? `${item.componentName}: ` : ''}{item.message}
            </li>
          ))}
        </ul>
      )}

      {stdioCount > 0 && (
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={approveExecutable} onChange={(event) => onApproveExecutableChange(event.target.checked)} />
          <span><strong>Approve local execution.</strong> These MCP servers can run commands on this machine. They cannot start until approved.</span>
        </label>
      )}

      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={exposeToCli} onChange={(event) => onExposeToCliChange(event.target.checked)} />
        <span>Expose selected skills and approved MCP servers through Sero CLI.</span>
      </label>

      {exposeToCli && (
        <div className="space-y-2">
          <label htmlFor="agent-plugin-cli-namespace" className="text-xs text-muted-foreground">CLI namespace</label>
          <Input id="agent-plugin-cli-namespace" value={namespace} onChange={(event) => onNamespaceChange(event.target.value)} className="h-8 font-mono text-xs" />
          <div className="flex flex-wrap gap-1.5">
            {validSkills.map((skill) => <Badge key={skill.name} variant="outline">{namespace}/{skill.name}</Badge>)}
            {validServers.map((server) => <Badge key={server.name} variant="outline">{namespace}/{server.name}/&lt;tool&gt;</Badge>)}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={busy || !inspection.valid} onClick={onInstall}>Install Agent Plugin</Button>
      </div>
    </div>
  );
}

function ComponentSummary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border/60 bg-background/60 p-3"><strong className="block text-base">{value}</strong>{label}</div>;
}
