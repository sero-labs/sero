import type { PinnedTransport } from './pinned-transport';
import {
  SERO_A2A_VERSION,
  getSeroExtension,
  type AgentCard,
} from '@sero-ai/a2a';
import { parseJson } from './http-json';
import { isRecord } from './types';

export interface ActivatedAgentCard {
  a2aUrl: string;
  controlUrl: string;
  tools: string[];
}

export async function activateAgentCard(
  transport: Pick<PinnedTransport, 'baseUrl' | 'request'>,
): Promise<ActivatedAgentCard> {
  const response = await transport.request('GET', '/.well-known/agent-card.json', {
    headers: { Accept: 'application/json', 'A2A-Version': SERO_A2A_VERSION },
  });
  if (response.status !== 200) throw new Error(`Agent Card returned HTTP ${response.status}`);
  const value = parseJson(response.body);
  if (!isRecord(value)) throw new Error('Agent Card is invalid');
  const card = value as unknown as AgentCard;
  const binding = card.supportedInterfaces?.find((item) => (
    item.protocolVersion === SERO_A2A_VERSION && item.protocolBinding.toUpperCase() === 'JSONRPC'
  ));
  if (!binding) throw new Error('Agent node does not declare A2A 1.0');
  const extension = getSeroExtension(card);
  if (!extension) {
    throw new Error('Agent Card does not declare the Sero control extension');
  }
  if (!hasBearerSecurity(card)) throw new Error('Agent Card does not require bearer authentication');
  requirePinnedOrigin(transport.baseUrl, binding.url);
  requirePinnedOrigin(transport.baseUrl, extension.params.url);
  return { a2aUrl: binding.url, controlUrl: extension.params.url, tools: [...extension.params.tools] };
}

function hasBearerSecurity(card: AgentCard): boolean {
  if (!card.securitySchemes || !Array.isArray(card.securityRequirements)) return false;
  const bearerNames = Object.entries(card.securitySchemes).flatMap(([name, scheme]) => {
    if (!isRecord(scheme) || !isRecord(scheme.scheme) || !isRecord(scheme.scheme.value)) return [];
    return String(scheme.scheme.value.scheme).toLowerCase() === 'bearer' ? [name] : [];
  });
  return bearerNames.some((name) => card.securityRequirements?.some((requirement) => (
    isRecord(requirement) && isRecord(requirement.schemes) && name in requirement.schemes
  )));
}

function requirePinnedOrigin(address: string, candidate: string): void {
  if (new URL(address).origin !== new URL(candidate).origin) {
    throw new Error('Agent Card declared an endpoint outside the pinned origin');
  }
}
