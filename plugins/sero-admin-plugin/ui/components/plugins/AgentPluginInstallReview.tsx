import { TriangleAlert } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
import { Label } from '@sero-ai/ui/components/ui/label';
import type { AgentPluginInspection } from '@sero-ai/common';
import { Band, ComponentGrid, DiagnosticList, MetaLine, componentCounts, diagnosticLookup, looseDiagnostics, mcpRows, skillRows } from './agent-plugin-ui';

export function AgentPluginInstallReview({
  inspection,
  approveMcp,
  exposeToCli,
  busy,
  onApproveMcpChange,
  onExposeToCliChange,
  onInstall,
  onCancel,
}: {
  inspection: AgentPluginInspection;
  approveMcp: boolean;
  exposeToCli: boolean;
  busy: boolean;
  onApproveMcpChange: (value: boolean) => void;
  onExposeToCliChange: (value: boolean) => void;
  onInstall: () => void;
  onCancel: () => void;
}) {
  const validServers = inspection.mcpServers.filter((server) => server.valid);
  const skipped = inspection.diagnostics.filter((item) => item.level === 'error');
  const reasonFor = diagnosticLookup(inspection.diagnostics);
  const otherDiagnostics = looseDiagnostics(inspection.diagnostics, inspection.skills, inspection.mcpServers);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5">
      <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{inspection.manifest?.name ?? 'Invalid package'}</h4>
            {inspection.manifest?.version && <Badge variant="secondary">v{inspection.manifest.version}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{inspection.manifest?.description ?? 'Review portable components before installation.'}</p>
          <MetaLine parts={[
            ...componentCounts(inspection.skills, inspection.mcpServers),
            ...(skipped.length > 0 ? [<span key="skipped" className="text-amber-400">{skipped.length === 1 ? '1 component skipped' : `${skipped.length} components skipped`}</span>] : []),
          ]} />
        </div>
        <Badge variant={inspection.valid ? 'default' : 'destructive'}>{inspection.valid ? 'Ready to install' : 'Invalid manifest'}</Badge>
      </div>

      <div className="flex items-start gap-2 border-t border-border/40 bg-amber-500/5 px-3.5 py-2.5 text-xs leading-relaxed text-amber-300/80">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
        <p><strong className="font-medium text-amber-400">Install only from sources you trust.</strong> Skills can direct the agent. MCP servers can connect to services or run commands on this machine.</p>
      </div>

      <Band>
        <ComponentGrid groups={[
          { label: 'Skills', rows: skillRows(inspection.skills, reasonFor) },
          { label: 'MCP servers', rows: mcpRows(inspection.mcpServers, reasonFor) },
        ]} />
      </Band>

      {otherDiagnostics.length > 0 && <Band><DiagnosticList diagnostics={otherDiagnostics} /></Band>}

      <Band className="flex flex-col gap-3">
        {validServers.length > 0 && (
          <div>
            <div className="flex items-center gap-2">
              <Checkbox id="agent-plugin-approve-mcp" checked={approveMcp} onCheckedChange={(checked) => onApproveMcpChange(checked === true)} />
              <Label htmlFor="agent-plugin-approve-mcp" className="text-xs font-normal">Approve these MCP definitions</Label>
            </div>
            <p className="mt-1.5 pl-6 text-xs text-muted-foreground">Local servers can run commands. Remote servers can connect to the shown endpoints.</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id="agent-plugin-cli-exposure" checked={exposeToCli} onCheckedChange={(checked) => onExposeToCliChange(checked === true)} />
          <Label htmlFor="agent-plugin-cli-exposure" className="text-xs font-normal">Show in Sero CLI</Label>
        </div>
      </Band>

      <Band className="flex justify-end gap-2 py-2.5">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={busy || !inspection.valid} onClick={onInstall}>Install Agent Plugin</Button>
      </Band>
    </div>
  );
}
