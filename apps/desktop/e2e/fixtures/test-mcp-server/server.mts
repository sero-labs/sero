// MCP test server for the e2e specs and the MCP plugin tests. Node runs this
// file directly with type stripping. Every mode serves the same tools and
// resources:
//   node server.mts                    stdio, both protocol eras
//   node server.mts --legacy           stdio, only the 2025 initialize handshake
//   node server.mts --http [--port n]  Streamable HTTP, both eras; prints its URL on the first line
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { acceptedContent, createMcpHandler, inputRequired, McpServer } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

// A small MCP app without an SDK: it speaks the MCP Apps JSON-RPC over postMessage.
// It shows the tool input and result, and its Refresh button calls an app-only tool.
const DASHBOARD_APP = `<!doctype html>
<html><body>
  <p id="input">waiting</p><p id="result"></p>
  <button id="refresh">Refresh</button><p id="refreshed"></p>
  <script>
    let nextId = 1;
    const pending = new Map();
    const request = (method, params) => {
      const id = nextId++;
      parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
      return new Promise((resolve) => pending.set(id, resolve));
    };
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message.result ?? { error: message.error });
        pending.delete(message.id);
        return;
      }
      if (message.method === 'ui/notifications/tool-input') {
        document.getElementById('input').textContent = 'region: ' + message.params.arguments.region;
      }
      if (message.method === 'ui/notifications/tool-result') {
        document.getElementById('result').textContent = message.params.content[0].text;
      }
    });
    document.getElementById('refresh').addEventListener('click', async () => {
      const result = await request('tools/call', { name: 'refresh_dashboard', arguments: {} });
      document.getElementById('refreshed').textContent = result.content ? result.content[0].text : 'failed';
    });
    request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'fixture-dashboard', version: '1.0.0' }, appCapabilities: {} })
      .then(() => parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized' }, '*'));
  </script>
</body></html>`;

/** Tools with MCP apps: a dashboard, an app that asks for a domain and a permission, and one Sero cannot show. */
function registerApps(server: McpServer): void {
  registerAppTool(server, 'show_dashboard', {
    description: 'Show the sales dashboard for a region.',
    inputSchema: { region: z.string() },
    _meta: { ui: { resourceUri: 'ui://fixture/dashboard' } },
  }, async ({ region }) => ({ content: [{ type: 'text' as const, text: `dashboard for ${region}` }] }));

  registerAppTool(server, 'refresh_dashboard', {
    description: 'Refresh the dashboard. Only the dashboard app calls this tool.',
    _meta: { ui: { resourceUri: 'ui://fixture/dashboard', visibility: ['app'] } },
  }, async () => ({ content: [{ type: 'text' as const, text: 'refreshed' }] }));

  registerAppTool(server, 'show_clipboard', {
    description: 'Show an app that asks for a network domain and clipboard access.',
    _meta: { ui: { resourceUri: 'ui://fixture/clipboard' } },
  }, async () => ({ content: [{ type: 'text' as const, text: 'clipboard app' }] }));

  registerAppTool(server, 'show_unsupported', {
    description: 'Show an app in a format that Sero does not support.',
    _meta: { ui: { resourceUri: 'ui://fixture/unsupported' } },
  }, async () => ({ content: [{ type: 'text' as const, text: 'unsupported app' }] }));

  registerAppResource(server, 'dashboard', 'ui://fixture/dashboard', { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: 'ui://fixture/dashboard', mimeType: RESOURCE_MIME_TYPE, text: DASHBOARD_APP }],
  }));

  registerAppResource(server, 'clipboard', 'ui://fixture/clipboard', { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{
      uri: 'ui://fixture/clipboard',
      mimeType: RESOURCE_MIME_TYPE,
      text: '<!doctype html><html><body>clipboard app</body></html>',
      _meta: { ui: { csp: { connectDomains: ['https://api.example.com'] }, permissions: { clipboardWrite: {} } } },
    }],
  }));

  server.registerResource('unsupported', 'ui://fixture/unsupported', { mimeType: 'application/json' }, async () => ({
    contents: [{ uri: 'ui://fixture/unsupported', mimeType: 'application/json', text: '{"widget":"chart"}' }],
  }));
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'sero-e2e-mcp-fixture', version: '0.0.0' });

  server.registerTool('echo', {
    description: 'Echo a deterministic message.',
    inputSchema: { message: z.string() },
  }, async ({ message }) => ({
    content: [{ type: 'text', text: `echo: ${message}` }],
  }));

  // Asks for input over two rounds (2026-07-28 input_required): a company name, then a team.
  server.registerTool('create_contact', {
    description: 'Create a contact after two questions.',
    inputSchema: {},
  }, async (_args, ctx) => {
    const responses = ctx.mcpReq.inputResponses;
    const company = acceptedContent<{ name: string }>(responses, 'company');
    if (company) {
      return inputRequired({
        inputRequests: {
          team: inputRequired.elicit({
            message: 'Which team owns the contact?',
            requestedSchema: { type: 'object', properties: { team: { type: 'string', enum: ['emea', 'apac'] } }, required: ['team'] },
          }),
        },
        requestState: company.name,
      });
    }
    const team = acceptedContent<{ team: string }>(responses, 'team');
    if (team) {
      return { content: [{ type: 'text', text: `created: ${ctx.mcpReq.requestState()} / ${team.team}` }] };
    }
    if (responses && Object.keys(responses).length > 0) {
      return { content: [{ type: 'text', text: 'not created' }] };
    }
    return inputRequired({
      inputRequests: {
        company: inputRequired.elicit({
          message: 'Which company does the contact work for?',
          requestedSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        }),
      },
    });
  });

  // Registers one more tool, so that the server reports a changed tool list.
  server.registerTool('reveal_tool', {
    description: 'Add the hidden tool to the tool list.',
    inputSchema: {},
  }, async () => {
    server.registerTool('hidden_tool', { description: 'Appears after reveal_tool.', inputSchema: {} }, async () => ({
      content: [{ type: 'text' as const, text: 'hidden' }],
    }));
    return { content: [{ type: 'text' as const, text: 'revealed' }] };
  });

  server.registerResource('noise-test', 'noise://test', {
    title: 'Noise Test',
    description: 'Deterministic test resource.',
    mimeType: 'text/plain',
  }, async () => ({
    contents: [{ uri: 'noise://test', text: 'deterministic noise fixture' }],
  }));

  registerApps(server);
  return server;
}

const args = process.argv.slice(2);

if (args.includes('--http')) {
  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 0;
  const server = http.createServer(toNodeHandler(createMcpHandler(createServer)));
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp\n`);
  });
} else if (args.includes('--legacy')) {
  await createServer().connect(new StdioServerTransport());
} else {
  serveStdio(createServer);
}
