import type { ReactNode } from 'react';
import type { AgentPluginDiagnostic, AgentPluginMcpServer, AgentPluginSkill } from '@sero-ai/common';
import { formatMcpDefinition } from './agent-plugin-mcp';

/**
 * Shared chrome for the Agent Plugin cards. The card keeps a single border and
 * splits into bands divided by one hairline, so contents, choices, updates and
 * actions never nest a second card edge inside each other.
 */
export function Band({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border-t border-border/40 px-3.5 py-3 ${className}`}>{children}</div>;
}

/** A dot-separated summary line, used under every plugin name. */
export function MetaLine({ parts }: { parts: ReactNode[] }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      {parts.map((part, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true" className="opacity-50">·</span>}
          {part}
        </span>
      ))}
    </p>
  );
}

export interface ComponentRow {
  name: string;
  detail: ReactNode;
  invalid?: boolean;
}

/**
 * Component inventory: a fixed label column, the component names, and the
 * detail (definition, state or skip reason) right-aligned on the same row.
 */
export function ComponentGrid({ groups }: { groups: Array<{ label: string; rows: ComponentRow[] }> }) {
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-3.5 gap-y-2 text-xs">
      {groups.map((group) => (
        <div key={group.label} className="contents">
          <dt className="text-muted-foreground">{group.label}</dt>
          <dd className="m-0 flex min-w-0 flex-col gap-1">
            {group.rows.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : group.rows.map((row) => (
              <div key={row.name} className={`flex items-baseline gap-3 ${row.invalid ? 'text-destructive' : ''}`}>
                <span className="shrink-0">{row.name}</span>
                {/* Wraps rather than truncates: an MCP command or URL is approved from this row and must stay readable in full. */}
                <span className={`ml-auto min-w-0 wrap-break-word text-right ${row.invalid ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {row.detail}
                </span>
              </div>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Why a component was skipped. Diagnostics are matched on component kind and
 * name together — a skill and an MCP server may share a name.
 */
export type DiagnosticLookup = (component: 'skill' | 'mcp', name: string) => string | undefined;

export function diagnosticLookup(diagnostics: AgentPluginDiagnostic[]): DiagnosticLookup {
  return (component, name) => diagnostics
    .find((item) => item.level === 'error' && item.component === component && item.componentName === name)
    ?.message;
}

/**
 * Diagnostics no component row carries: manifest errors, warnings, unmatched
 * names, and any further error for a component whose row already shows the
 * first one. Nothing is dropped and nothing is printed twice.
 */
export function looseDiagnostics(
  diagnostics: AgentPluginDiagnostic[],
  skills: AgentPluginSkill[],
  servers: AgentPluginMcpServer[],
): AgentPluginDiagnostic[] {
  const lookup = diagnosticLookup(diagnostics);
  const onRows = new Set<AgentPluginDiagnostic>();
  const take = (component: 'skill' | 'mcp', name: string) => {
    const shown = lookup(component, name);
    const match = diagnostics.find((item) => item.level === 'error' && item.component === component && item.componentName === name && item.message === shown);
    if (match) onRows.add(match);
  };
  for (const skill of skills.filter((skill) => !skill.valid)) take('skill', skill.name);
  for (const server of servers.filter((server) => !server.valid)) take('mcp', server.name);
  return diagnostics.filter((item) => !onRows.has(item));
}

export function DiagnosticList({ diagnostics }: { diagnostics: AgentPluginDiagnostic[] }) {
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {diagnostics.map((item, index) => (
        <li key={`${index}:${item.component}:${item.componentName ?? ''}:${item.message}`} className={item.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
          {item.componentName ? `${item.componentName}: ` : ''}{item.message}
        </li>
      ))}
    </ul>
  );
}

export function skillRows(skills: AgentPluginSkill[], diagnosticFor: DiagnosticLookup): ComponentRow[] {
  return skills.map((skill) => ({
    name: skill.name,
    detail: skill.valid ? 'Ready' : `Skipped · ${diagnosticFor('skill', skill.name) ?? 'invalid skill'}`,
    invalid: !skill.valid,
  }));
}

export function mcpRows(
  servers: AgentPluginMcpServer[],
  diagnosticFor: DiagnosticLookup,
  /** Installed plugins mark servers that still wait for approval. Nothing is approved yet during a preview. */
  showApproval = false,
): ComponentRow[] {
  return servers.map((server) => ({
    name: server.name,
    detail: server.valid
      ? `${server.transport === 'stdio' ? 'stdio · ' : ''}${formatMcpDefinition(server)}${showApproval && !server.approved ? ' · approval needed' : ''}`
      : `Skipped · ${diagnosticFor('mcp', server.name) ?? 'invalid MCP server'}`,
    invalid: !server.valid,
  }));
}

/** Counts for the meta line: "2 skills · 1 local MCP · 1 remote MCP". */
export function componentCounts(skills: AgentPluginSkill[], servers: AgentPluginMcpServer[]): string[] {
  const validSkills = skills.filter((skill) => skill.valid).length;
  const validServers = servers.filter((server) => server.valid);
  const local = validServers.filter((server) => server.transport === 'stdio').length;
  const remote = validServers.length - local;
  return [
    validSkills === 1 ? '1 skill' : `${validSkills} skills`,
    ...(local > 0 ? [local === 1 ? '1 local MCP' : `${local} local MCP`] : []),
    ...(remote > 0 ? [remote === 1 ? '1 remote MCP' : `${remote} remote MCP`] : []),
    ...(local + remote === 0 ? ['no MCP servers'] : []),
  ];
}
