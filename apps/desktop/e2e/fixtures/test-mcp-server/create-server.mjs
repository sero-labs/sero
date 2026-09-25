// One server factory for every fixture entry, so both protocol eras and both
// transports serve the same tools and resources.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const pluginPackagePath = path.resolve(import.meta.dirname, '../../../../../plugins/sero-mcp-plugin/package.json');
const pluginRequire = createRequire(pluginPackagePath);

/** Loads a package from the MCP plugin's dependencies. */
export const load = (specifier) => import(pathToFileURL(pluginRequire.resolve(specifier)).href);

const { McpServer } = await load('@modelcontextprotocol/server');
const z = await load('zod');

export function createServer() {
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
