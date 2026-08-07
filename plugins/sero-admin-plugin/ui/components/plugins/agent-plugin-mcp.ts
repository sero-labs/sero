import type { AgentPluginMcpServer } from '@sero-ai/common';

export function formatMcpDefinition(server: AgentPluginMcpServer): string {
  const details: string[] = [];
  if (server.transport === 'stdio') {
    if (server.cwd) details.push(`cwd: ${server.cwd}`);
    const envNames = Object.keys(server.env ?? {}).sort();
    if (envNames.length > 0) details.push(`env: ${envNames.join(', ')}`);
    return appendDetails([server.command, ...(server.args ?? [])].filter(Boolean).join(' '), details);
  }
  const headerNames = Object.keys(server.headers ?? {}).sort();
  if (headerNames.length > 0) details.push(`headers: ${headerNames.join(', ')}`);
  return appendDetails(server.url ?? 'Missing URL', details);
}

function appendDetails(target: string, details: string[]): string {
  return details.length > 0 ? `${target} (${details.join('; ')})` : target;
}
