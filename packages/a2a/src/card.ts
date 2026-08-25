import type { AgentCard, AgentExtension } from '@a2a-js/sdk';
import { z } from 'zod';
import {
  SERO_A2A_VERSION,
  SERO_BEARER_SCHEME,
  SERO_EXTENSION_URI,
} from './constants';

export interface SeroExtensionParams {
  url: string;
  tools: string[];
}

export const SeroExtensionParamsSchema = z.object({
  url: z.url(),
  tools: z.array(z.string().min(1)),
}).strict();

export interface SeroAgentCardOptions {
  card: Omit<AgentCard, 'supportedInterfaces' | 'capabilities' | 'securitySchemes' | 'securityRequirements'>;
  a2aUrl: string;
  controlUrl: string;
  tenant: string;
  tools: readonly string[];
}

export function createSeroExtension(
  url: string,
  tools: readonly string[],
): AgentExtension & { params: SeroExtensionParams } {
  return {
    uri: SERO_EXTENSION_URI,
    description: 'Sero control plane and declared node tool surface.',
    required: false,
    params: { url, tools: [...tools] },
  };
}

export function createSeroAgentCard(options: SeroAgentCardOptions): AgentCard {
  return {
    ...options.card,
    supportedInterfaces: [{
      url: options.a2aUrl,
      protocolBinding: 'JSONRPC',
      protocolVersion: SERO_A2A_VERSION,
      tenant: options.tenant,
    }],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [createSeroExtension(options.controlUrl, options.tools)],
    },
    securitySchemes: {
      [SERO_BEARER_SCHEME]: {
        scheme: {
          $case: 'httpAuthSecurityScheme',
          value: {
            description: 'Sero controller token',
            scheme: 'Bearer',
            bearerFormat: 'opaque',
          },
        },
      },
    },
    securityRequirements: [{ schemes: { [SERO_BEARER_SCHEME]: { list: [] } } }],
  };
}

export function getSeroExtension(
  card: AgentCard,
): (AgentExtension & { params: SeroExtensionParams }) | undefined {
  const extension = card.capabilities?.extensions.find(({ uri }) => uri === SERO_EXTENSION_URI);
  const params = SeroExtensionParamsSchema.safeParse(extension?.params);
  if (!extension || extension.required || !params.success) return undefined;
  return { ...extension, params: params.data };
}
