import type { AgentNodeInfo } from '@/types/agent-node';

export function nodeDisplayName(node: AgentNodeInfo): string {
  const configuredName = node.name.trim();
  if (configuredName && configuredName !== node.address) return configuredName;
  try {
    return new URL(node.address).hostname.replace(/\.local$/u, '');
  } catch {
    return configuredName || node.address;
  }
}

export function suggestedNodeName(address: string): string {
  try {
    return new URL(address).hostname.replace(/\.local$/u, '');
  } catch {
    return '';
  }
}

export function canSendToNode(node: AgentNodeInfo): boolean {
  return node.connectionState !== 'revoked' && node.connectionState !== 'unreachable';
}

export function canManageNode(node: AgentNodeInfo): boolean {
  return canSendToNode(node) && node.connectionState !== 'version-skew';
}
