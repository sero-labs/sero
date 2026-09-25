import { InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import {
  createMcpClient,
  MCP_APPS_EXTENSION,
  MCP_SKILLS_EXTENSION,
  MCP_TASKS_EXTENSION,
  type McpClientFeatures,
} from '../manager/client-factory';

async function capabilitiesSeenByServer(features?: McpClientFeatures) {
  const server = new McpServer({ name: 'fixture', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = createMcpClient('sero-mcp-test', { features });
  await client.connect(clientTransport);
  const capabilities = server.server.getClientCapabilities();
  await client.close();
  await server.close();
  return capabilities;
}

describe('createMcpClient', () => {
  it('declares no sampling or roots', async () => {
    const capabilities = await capabilitiesSeenByServer();
    expect(capabilities).toBeDefined();
    expect(capabilities).not.toHaveProperty('sampling');
    expect(capabilities).not.toHaveProperty('roots');
  });

  it('declares no extension when every host feature is off', async () => {
    const capabilities = await capabilitiesSeenByServer({ apps: false, tasks: false, skills: false });
    expect(capabilities).not.toHaveProperty('extensions');
  });

  it('declares only the extensions whose host feature is on', async () => {
    const capabilities = await capabilitiesSeenByServer({ apps: true, tasks: false, skills: false });
    expect(capabilities?.extensions?.[MCP_APPS_EXTENSION]).toEqual({ mimeTypes: ['text/html;profile=mcp-app'] });
    expect(capabilities?.extensions).not.toHaveProperty(MCP_TASKS_EXTENSION);
    expect(capabilities?.extensions).not.toHaveProperty(MCP_SKILLS_EXTENSION);
  });
});
