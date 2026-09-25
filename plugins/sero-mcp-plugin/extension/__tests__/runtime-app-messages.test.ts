import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/app-bridge';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let server: http.Server;
let url = '';

beforeAll(async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-app-messages-'));
  process.env.SERO_HOME = home;
  process.env.PI_CODING_AGENT_DIR = home;
  const createServer = () => {
    const mcp = new McpServer({ name: 'sales', version: '1.0.0' });
    mcp.registerTool('show_dashboard', { _meta: { ui: { resourceUri: 'ui://sales/dashboard' } } }, async () => ({
      content: [{ type: 'text', text: 'dashboard' }],
    }));
    mcp.registerResource('dashboard', 'ui://sales/dashboard', { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri: 'ui://sales/dashboard', mimeType: RESOURCE_MIME_TYPE, text: '<html><body>app</body></html>' }],
    }));
    return mcp;
  };
  server = http.createServer(toNodeHandler(createMcpHandler(createServer)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('MCP app messages', () => {
  it('delivers ui/message to the chat session that shows the app, with the app label', async () => {
    const { getMcpRuntime } = await import('../runtime/mcp-runtime');
    const runtime = getMcpRuntime();
    const send = vi.fn();
    const unregister = runtime.registerSession('chat-1', send);
    await runtime.executeManagerAction('save_raw_config', {
      rawConfig: JSON.stringify({ mcpServers: { sales: { transport: 'http', url } } }),
    });

    const opened = await runtime.executeManagerAction('open_tool_ui', {
      serverName: 'sales',
      toolName: 'show_dashboard',
      sessionId: 'chat-1',
    });
    const viewerUrl = String(opened.details.viewerUrl);
    const response = await fetch(new URL('/proxy/ui/message', viewerUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: opened.details.viewerId, params: { role: 'user', content: [{ type: 'text', text: 'Show Germany' }] } }),
    });

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ customType: 'mcp-app-message', content: 'sales · show_dashboard app: Show Germany', display: true }),
      { triggerTurn: true, deliverAs: 'followUp' },
    );
    unregister();
    await runtime.executeManagerAction('disable_server', { serverName: 'sales' });
  });
});
