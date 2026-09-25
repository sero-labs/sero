// MCP test server for the e2e specs and the MCP plugin tests. Node runs this
// file directly with type stripping. Every mode serves the same tools and
// resources:
//   node server.mts                    stdio, both protocol eras
//   node server.mts --legacy           stdio, only the 2025 initialize handshake
//   node server.mts --http [--port n]  Streamable HTTP, both eras; prints its URL on the first line
// Only the HTTP mode serves MCP Tasks (see serveTasks below). POST /admin/offline
// and /admin/online make its MCP endpoint fail and recover, for connection-loss tests.
// Any mode takes --no-skills to leave out the Skills extension.
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { acceptedContent, createMcpHandler, inputRequired, McpServer, ProtocolError } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

// A small MCP app without an SDK: it speaks the MCP Apps JSON-RPC over postMessage.
// It shows the tool input and result, and its Refresh button calls an app-only tool.
const DASHBOARD_APP = `<!doctype html>
<html><head><style>
  body { margin: 0; padding: 16px; font: 14px system-ui, sans-serif; color: #e6e6e6; background: #1b1d22; }
  #input { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
  #result, #refreshed { margin: 4px 0; color: #a8b0bd; }
  button { margin-top: 8px; padding: 6px 12px; border: 1px solid #3a3f4a; border-radius: 6px; color: inherit; background: #262a31; font: inherit; }
</style></head><body>
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

const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
const SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';

// Skills over MCP (SEP-2640): one skill with a supporting file, and one dynamic skill.
const SKILL_FILES: Record<string, string> = {
  'skill://docs/release-notes/SKILL.md': [
    '---',
    'name: release-notes',
    'description: Writes release notes from merged pull requests.',
    '---',
    '# Release notes',
    '',
    'Use templates/summary.md for the summary.',
    'Run `git log --oneline` to list the changes.',
    '',
  ].join('\n'),
  'skill://docs/release-notes/templates/summary.md': '## Summary\n\n- {change}\n',
  'skill://docs/daily/SKILL.md': '---\nname: daily\ndescription: Builds the daily report from live data.\n---\n# Daily\n',
};

const skillResource = (uri: string) => {
  const bytes = Buffer.from(SKILL_FILES[uri]!, 'utf8');
  return { uri, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, size: bytes.length };
};

const SKILLS = [
  {
    uri: 'skill://docs/release-notes/SKILL.md',
    frontmatter: { name: 'release-notes', description: 'Writes release notes from merged pull requests.' },
    resources: [skillResource('skill://docs/release-notes/SKILL.md'), skillResource('skill://docs/release-notes/templates/summary.md')],
  },
  {
    uri: 'skill://docs/daily/SKILL.md',
    frontmatter: { name: 'daily', description: 'Builds the daily report from live data.' },
    resources: 'dynamic' as const,
  },
];

/** Answers the Skills methods, which the SDK server does not know. */
function registerSkills(server: McpServer): void {
  for (const uri of Object.keys(SKILL_FILES)) {
    server.registerResource(uri, uri, { mimeType: 'text/markdown' }, async () => ({ contents: [{ uri, mimeType: 'text/markdown', text: SKILL_FILES[uri]! }] }));
  }
  server.server.fallbackRequestHandler = async (request) => {
    const params = (request.params ?? {}) as { uri?: string };
    if (request.method === 'skills/list') return { skills: SKILLS, ttlMs: 0, cacheScope: 'public' };
    if (request.method === 'skills/get') {
      const skill = SKILLS.find((entry) => entry.uri === params.uri);
      if (!skill) throw new ProtocolError(-32602, `No skill is served at ${params.uri}`);
      return { skill, ttlMs: 0, cacheScope: 'public' };
    }
    if (request.method === 'resources/directory/read') {
      const prefix = `${params.uri}/`;
      const names = new Map<string, boolean>();
      for (const uri of Object.keys(SKILL_FILES).filter((file) => file.startsWith(prefix))) {
        const rest = uri.slice(prefix.length);
        names.set(rest.split('/')[0]!, rest.includes('/'));
      }
      if (names.size === 0) throw new ProtocolError(-32602, `${params.uri} is not a directory resource`);
      return {
        resources: [...names].map(([name, isDirectory]) => ({
          uri: `${prefix}${name}`,
          name,
          mimeType: isDirectory ? 'inode/directory' : 'text/markdown',
        })),
      };
    }
    throw new ProtocolError(-32601, 'Method not found');
  };
}

function createServer(options: { tasks?: boolean; skills?: boolean } = {}): McpServer {
  const skills = options.skills ?? true;
  const server = new McpServer({ name: 'sero-e2e-mcp-fixture', version: '0.0.0' }, {
    capabilities: {
      extensions: {
        ...(skills ? { [SKILLS_EXTENSION]: { directoryRead: true } } : {}),
        ...(options.tasks ? { [TASKS_EXTENSION]: {} } : {}),
      },
    },
  });

  // With a client that declares Tasks, serveTasks answers this call with a task.
  // Without Tasks, the report is ready at once.
  server.registerTool('run_report', {
    description: 'Build a report. It runs as a task when the client supports Tasks.',
    inputSchema: {
      plan: z.enum(['complete', 'fail', 'input', 'hold']).optional(),
      region: z.string().optional(),
      delayMs: z.number().optional(),
      ttlMs: z.number().optional(),
    },
  }, async ({ region }) => ({ content: [{ type: 'text', text: `report ready: ${region ?? 'all'}` }] }));

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
  if (skills) registerSkills(server);
  return server;
}

interface FixtureTask {
  taskId: string;
  status: 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';
  plan: 'complete' | 'fail' | 'input' | 'hold';
  region: string;
  readyAt: number;
  delayMs: number;
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number;
  answer?: string;
}

interface JsonRpcRequest {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

type TaskReply = { result: Record<string, unknown> } | { error: { code: number; message: string } };

/**
 * A small MCP Tasks server (2026-07-28 Tasks extension). The SDK server has no
 * public Tasks API and refuses tasks/* methods on the modern era, so this layer
 * answers them before the SDK handler. A task advances when it is read.
 */
function serveTasks() {
  const tasks = new Map<string, FixtureTask>();
  let counter = 0;

  const view = (task: FixtureTask) => {
    const base = {
      taskId: task.taskId,
      status: task.status,
      createdAt: task.createdAt,
      lastUpdatedAt: task.lastUpdatedAt,
      ttlMs: task.ttlMs,
      pollIntervalMs: 100,
    };
    if (task.status === 'completed') {
      const text = task.answer === undefined ? `report ready: ${task.region}` : `report ready: ${task.region}, drafts: ${task.answer}`;
      return { ...base, result: { resultType: 'complete', content: [{ type: 'text', text }] } };
    }
    if (task.status === 'failed') return { ...base, error: { code: -32000, message: 'The report failed.' } };
    if (task.status === 'input_required') {
      return {
        ...base,
        inputRequests: {
          drafts: {
            method: 'elicitation/create',
            params: {
              mode: 'form',
              message: 'Include draft orders?',
              requestedSchema: { type: 'object', properties: { drafts: { type: 'boolean' } }, required: ['drafts'] },
            },
          },
        },
      };
    }
    return base;
  };

  const advance = (task: FixtureTask) => {
    if (task.status !== 'working' || task.plan === 'hold' || Date.now() < task.readyAt) return;
    task.lastUpdatedAt = new Date().toISOString();
    if (task.plan === 'fail') task.status = 'failed';
    else if (task.plan === 'input' && task.answer === undefined) task.status = 'input_required';
    else task.status = 'completed';
  };

  const clientDeclaresTasks = (params: Record<string, unknown> | undefined) => {
    const meta = params?._meta as Record<string, unknown> | undefined;
    const capabilities = meta?.['io.modelcontextprotocol/clientCapabilities'] as { extensions?: Record<string, unknown> } | undefined;
    return capabilities?.extensions?.[TASKS_EXTENSION] !== undefined;
  };

  return (message: JsonRpcRequest): TaskReply | undefined => {
    const params = message.params ?? {};
    if (message.method === 'tools/call' && params.name === 'run_report' && clientDeclaresTasks(params)) {
      const input = (params.arguments ?? {}) as { plan?: FixtureTask['plan']; region?: string; delayMs?: number; ttlMs?: number };
      const now = new Date().toISOString();
      const task: FixtureTask = {
        taskId: `task-${++counter}`,
        status: 'working',
        plan: input.plan ?? 'complete',
        region: input.region ?? 'all',
        delayMs: input.delayMs ?? 1_500,
        readyAt: Date.now() + (input.delayMs ?? 1_500),
        createdAt: now,
        lastUpdatedAt: now,
        ttlMs: input.ttlMs ?? 600_000,
      };
      tasks.set(task.taskId, task);
      const { result: _result, ...created } = view(task) as ReturnType<typeof view> & { result?: unknown };
      return { result: { ...created, resultType: 'task' } };
    }
    if (typeof message.method !== 'string' || !message.method.startsWith('tasks/')) return undefined;
    const task = tasks.get(String(params.taskId));
    if (!task) return { error: { code: -32602, message: `Unknown task: ${String(params.taskId)}` } };
    if (message.method === 'tasks/get') {
      advance(task);
      return { result: { ...view(task), resultType: 'complete' } };
    }
    if (message.method === 'tasks/update') {
      const responses = params.inputResponses as Record<string, { action?: string; content?: { drafts?: boolean } }> | undefined;
      const drafts = responses?.drafts;
      task.answer = drafts?.action === 'accept' ? String(drafts.content?.drafts) : 'declined';
      task.status = 'working';
      task.readyAt = Date.now() + task.delayMs;
      task.lastUpdatedAt = new Date().toISOString();
      return { result: { resultType: 'complete' } };
    }
    if (message.method === 'tasks/cancel') {
      task.status = 'cancelled';
      task.lastUpdatedAt = new Date().toISOString();
      return { result: { resultType: 'complete' } };
    }
    return { error: { code: -32601, message: 'Method not found' } };
  };
}

const args = process.argv.slice(2);
// --no-skills leaves out the Skills extension, so that only chosen servers offer skills.
const skills = !args.includes('--no-skills');

if (args.includes('--http')) {
  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 0;
  const mcpHandler = toNodeHandler(createMcpHandler(() => createServer({ tasks: true, skills })));
  const answerTask = serveTasks();
  let offline = false;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/admin/offline' || req.url === '/admin/online') {
        offline = req.url === '/admin/offline';
        res.writeHead(204).end();
        return;
      }
      if (offline) {
        res.writeHead(503).end();
        return;
      }
      const message = body ? JSON.parse(body) as JsonRpcRequest : undefined;
      const reply = message ? answerTask(message) : undefined;
      if (reply) {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message?.id, ...reply }));
        return;
      }
      void mcpHandler(req, res, message);
    });
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp\n`);
  });
} else if (args.includes('--legacy')) {
  await createServer({ skills }).connect(new StdioServerTransport());
} else {
  serveStdio(() => createServer({ skills }));
}
