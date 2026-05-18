#!/usr/bin/env node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pluginPackagePath = path.resolve(import.meta.dirname, '../../../../../plugins/sero-mcp-plugin/package.json');
const pluginRequire = createRequire(pluginPackagePath);

const { McpServer } = await import(pathToFileURL(pluginRequire.resolve('@modelcontextprotocol/sdk/server/mcp.js')).href);
const { StdioServerTransport } = await import(pathToFileURL(pluginRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href);
const z = await import(pathToFileURL(pluginRequire.resolve('zod')).href);

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

const transport = new StdioServerTransport();
await server.connect(transport);
