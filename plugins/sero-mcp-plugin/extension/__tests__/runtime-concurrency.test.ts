import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { acceptedContent, createMcpHandler, inputRequired, McpServer } from '@modelcontextprotocol/server';
import {
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  type UserFeedbackPendingQuestion,
} from '@sero-ai/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const bus = getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => new EventEmitter());
let server: http.Server;
let url = '';

beforeAll(async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-runtime-'));
  process.env.SERO_HOME = home;
  process.env.PI_CODING_AGENT_DIR = home;
  const createServer = () => {
    const mcp = new McpServer({ name: 'crm', version: '1.0.0' });
    mcp.registerTool('confirm', { inputSchema: z.object({}) }, async (_args, ctx) => {
      const answer = acceptedContent<{ ok: boolean }>(ctx.mcpReq.inputResponses, 'ok');
      if (answer) return { content: [{ type: 'text', text: `confirmed: ${answer.ok}` }] };
      return inputRequired({
        inputRequests: {
          ok: inputRequired.elicit({ message: 'Go?', requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } }),
        },
      });
    });
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

describe('MCP runtime queue', () => {
  it('answers a status request while a tool call waits for the user', async () => {
    const { getMcpRuntime } = await import('../runtime/mcp-runtime');
    const runtime = getMcpRuntime();
    await runtime.executeManagerAction('save_raw_config', {
      rawConfig: JSON.stringify({ mcpServers: { crm: { transport: 'http', url } } }),
    });

    const asked = new Promise<UserFeedbackPendingQuestion>((resolve) => {
      bus.once(USER_FEEDBACK_QUESTION_REQUEST_EVENT, resolve);
    });
    const call = runtime.executeProxyAction('call_tool', { serverName: 'crm', toolName: 'confirm' });
    const question = await asked;

    const status = await runtime.executeProxyAction('status');
    expect(status.content[0]?.text).toContain('1 server(s) configured');

    bus.emit(getUserFeedbackAnswerEvent(question.id), {
      id: question.id,
      cancelled: false,
      answers: [{ questionId: 'ok', value: 'true', label: 'Yes', wasCustom: false }],
    });
    expect((await call).content[0]?.text).toContain('confirmed: true');
    await runtime.executeManagerAction('disable_server', { serverName: 'crm' });
  });
});
