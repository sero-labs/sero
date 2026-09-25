// MCP test server for the e2e specs and the MCP plugin tests. Node runs this
// file directly with type stripping. Every mode serves the same tools and
// resources:
//   node server.mts                    stdio, both protocol eras
//   node server.mts --legacy           stdio, only the 2025 initialize handshake
//   node server.mts --http [--port n]  Streamable HTTP, both eras; prints its URL on the first line
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { acceptedContent, createMcpHandler, inputRequired, McpServer } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

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
