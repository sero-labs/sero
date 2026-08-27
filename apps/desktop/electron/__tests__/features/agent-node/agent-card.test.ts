import { describe, expect, it } from 'vitest';
import { SERO_EXTENSION_URI } from '@sero-ai/a2a';
import { activateAgentCard } from '@electron/features/agent-node/agent-card';
import type { TransportResponse } from '@electron/features/agent-node/pinned-transport';

function transport(card: unknown) {
  return {
    baseUrl: 'https://spark.test',
    request: async (): Promise<TransportResponse> => ({
      status: 200,
      headers: {},
      body: Buffer.from(JSON.stringify(card)),
    }),
  };
}

const interfaceV1 = {
  url: 'https://spark.test/',
  protocolBinding: 'JSONRPC',
  protocolVersion: '1.0',
};

const bearerSecurity = {
  securitySchemes: {
    seroBearer: { scheme: { value: { scheme: 'Bearer' } } },
  },
  securityRequirements: [{ schemes: { seroBearer: { list: [] } } }],
};

describe('Agent Node Agent Card activation', () => {
  it('activates control only from the declared Sero extension', async () => {
    await expect(activateAgentCard(transport({
      supportedInterfaces: [interfaceV1],
      ...bearerSecurity,
      capabilities: { extensions: [{
        uri: SERO_EXTENSION_URI,
        required: false,
        params: { url: 'https://spark.test/sero/v1', tools: ['read'] },
      }] },
    }))).resolves.toEqual({
      a2aUrl: 'https://spark.test/',
      controlUrl: 'https://spark.test/sero/v1',
      tools: ['read'],
    });
  });

  it('refuses version 0.3 and a missing extension', async () => {
    await expect(activateAgentCard(transport({
      supportedInterfaces: [{ ...interfaceV1, protocolVersion: '0.3' }],
      ...bearerSecurity,
    }))).rejects.toThrow('A2A 1.0');
    await expect(activateAgentCard(transport({ supportedInterfaces: [interfaceV1], ...bearerSecurity })))
      .rejects.toThrow('does not declare the Sero control extension');
  });

  it('refuses endpoints outside the pinned origin', async () => {
    await expect(activateAgentCard(transport({
      supportedInterfaces: [interfaceV1],
      ...bearerSecurity,
      capabilities: { extensions: [{
        uri: SERO_EXTENSION_URI,
        required: false,
        params: { url: 'https://attacker.test/sero/v1', tools: [] },
      }] },
    }))).rejects.toThrow('outside the pinned origin');
  });
});
