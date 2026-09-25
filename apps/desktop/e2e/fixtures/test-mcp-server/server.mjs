#!/usr/bin/env node
// MCP test server for the e2e specs. By default it serves both protocol eras
// over stdio. With --legacy it serves only the 2025 initialize handshake.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const pluginPackagePath = path.resolve(import.meta.dirname, '../../../../../plugins/sero-mcp-plugin/package.json');
const pluginRequire = createRequire(pluginPackagePath);
const load = (specifier) => import(pathToFileURL(pluginRequire.resolve(specifier)).href);

const { McpServer } = await load('@modelcontextprotocol/server');
const { serveStdio, StdioServerTransport } = await load('@modelcontextprotocol/server/stdio');
const z = await load('zod');

function createServer() {
  const server = new McpServer({ name: 'sero-e2e-mcp-fixture', version: '0.0.0' });

  server.registerTool('echo', {
    description: 'Echo a deterministic message.',
    inputSchema: { message: z.string() }
  }, async ({ message }) => ({
    content: [{ type: 'text', text: `echo: ${message}` }]
  }));

  server.registerResource('noise-test', 'noise://test', {
    title: 'Noise Test',
    description: 'Deterministic test resource.',
    mimeType: 'text/plain'
  }, async () => ({
    contents: [{ uri: 'noise://test', text: 'deterministic noise fixture' }]
  }));

  return server;
}

if (process.argv.includes('--legacy')) {
  await createServer().connect(new StdioServerTransport());
} else {
  serveStdio(createServer);
}
