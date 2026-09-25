// One server factory for every fixture entry, so both protocol eras and both
// transports serve the same tools and resources.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const pluginPackagePath = path.resolve(import.meta.dirname, '../../../../../plugins/sero-mcp-plugin/package.json');
const pluginRequire = createRequire(pluginPackagePath);

/** Loads a package from the MCP plugin's dependencies. */
export const load = (specifier) => import(pathToFileURL(pluginRequire.resolve(specifier)).href);

const { McpServer, acceptedContent, inputRequired } = await load('@modelcontextprotocol/server');
const z = await load('zod');

export function createServer() {
  const server = new McpServer({ name: 'sero-e2e-mcp-fixture', version: '0.0.0' });

  server.registerTool('echo', {
    description: 'Echo a deterministic message.',
    inputSchema: { message: z.string() }
  }, async ({ message }) => ({
    content: [{ type: 'text', text: `echo: ${message}` }]
  }));

  // Asks for input over two rounds (2026-07-28 input_required): a company name, then a team.
  server.registerTool('create_contact', {
    description: 'Create a contact after two questions.',
    inputSchema: {}
  }, async (_args, ctx) => {
    const responses = ctx.mcpReq.inputResponses;
    const company = acceptedContent(responses, 'company');
    if (company) {
      return inputRequired({
        inputRequests: {
          team: inputRequired.elicit({
            message: 'Which team owns the contact?',
            requestedSchema: { type: 'object', properties: { team: { type: 'string', enum: ['emea', 'apac'] } }, required: ['team'] }
          })
        },
        requestState: company.name
      });
    }
    const team = acceptedContent(responses, 'team');
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
          requestedSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
        })
      }
    });
  });

  server.registerResource('noise-test', 'noise://test', {
    title: 'Noise Test',
    description: 'Deterministic test resource.',
    mimeType: 'text/plain'
  }, async () => ({
    contents: [{ uri: 'noise://test', text: 'deterministic noise fixture' }]
  }));

  return server;
}
