import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { InMemoryTransport } from '@modelcontextprotocol/client';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { acceptedContent, createMcpHandler, inputRequired, McpServer } from '@modelcontextprotocol/server';
import {
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  type UserFeedbackPendingQuestion,
  type UserFeedbackResponse,
} from '@sero-ai/common';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runWithRequestContext } from '../elicitation/request-context';
import { DECLINE_VALUE } from '../elicitation/form-questionnaire';
import { createMcpClient } from '../manager/client-factory';
import { McpServerManager } from '../manager/server-manager';

type Reply = (question: UserFeedbackPendingQuestion) => Omit<UserFeedbackResponse, 'id'>;

const bus = getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => new EventEmitter());
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** A fake question UI: answers each question with the next reply. */
function answerWith(...replies: Reply[]) {
  const asked: UserFeedbackPendingQuestion[] = [];
  const listener = (question: UserFeedbackPendingQuestion) => {
    asked.push(question);
    const reply = replies.shift();
    if (reply) setImmediate(() => bus.emit(getUserFeedbackAnswerEvent(question.id), { id: question.id, ...reply(question) }));
  };
  bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, listener);
  cleanups.push(() => { bus.off(USER_FEEDBACK_QUESTION_REQUEST_EVENT, listener); });
  return asked;
}

const pick = (value: string, wasCustom = false): Reply => (question) => ({
  cancelled: false,
  answers: [{ questionId: question.questions[0]!.id, value, label: value, wasCustom }],
});
const cancel: Reply = () => ({ cancelled: true, answers: [] });

const NAME_FORM = { type: 'object' as const, properties: { name: { type: 'string' as const } }, required: ['name'] };
const TEAM_FORM = { type: 'object' as const, properties: { team: { type: 'string' as const, enum: ['emea', 'apac'] } }, required: ['team'] };

/** A modern server whose tool asks for a company name, then for a team. */
async function startModernServer() {
  const createServer = () => {
    const server = new McpServer({ name: 'crm', version: '1.0.0' });
    server.registerTool('create_contact', { inputSchema: z.object({}) }, async (_args, ctx) => {
      const responses = ctx.mcpReq.inputResponses;
      const answers = Object.values(responses ?? {}) as Array<{ action?: string }>;
      if (answers.some((answer) => answer.action && answer.action !== 'accept')) {
        return { content: [{ type: 'text', text: `ended: ${answers[0]?.action}` }] };
      }
      const company = acceptedContent<{ name: string }>(responses, 'company');
      if (company) {
        return inputRequired({
          inputRequests: { team: inputRequired.elicit({ message: 'Which team?', requestedSchema: TEAM_FORM }) },
          requestState: company.name,
        });
      }
      const team = acceptedContent<{ team: string }>(responses, 'team');
      if (team) {
        return { content: [{ type: 'text', text: `${ctx.mcpReq.requestState<string>()}/${team.team}` }] };
      }
      return inputRequired({ inputRequests: { company: inputRequired.elicit({ message: 'Company?', requestedSchema: NAME_FORM }) } });
    });
    return server;
  };
  const server = http.createServer(toNodeHandler(createMcpHandler(createServer)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const manager = new McpServerManager();
  cleanups.push(() => manager.closeAll());
  const connection = await manager.connect('crm', { transport: 'http', url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp` });
  expect(connection.protocol?.era).toBe('modern');
  return manager;
}

/** A legacy server whose tool sends elicitation/create and reports the action. */
async function connectLegacyServer() {
  const server = new McpServer({ name: 'legacy-crm', version: '1.0.0' });
  server.registerTool('rename', { inputSchema: z.object({}) }, async (_args, ctx) => {
    const result = await ctx.mcpReq.elicitInput({ mode: 'form', message: 'New name?', requestedSchema: NAME_FORM });
    return { content: [{ type: 'text', text: `${result.action}:${JSON.stringify(result.content ?? {})}` }] };
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = createMcpClient('sero-mcp-legacy', { serverLabel: 'legacy-crm' });
  await client.connect(clientTransport);
  cleanups.push(async () => { await client.close(); await server.close(); });
  const call = () => runWithRequestContext({ serverLabel: 'legacy-crm', toolName: 'rename' }, () => client.callTool({ name: 'rename', arguments: {} }));
  return { client, call };
}

const text = (result: { content: unknown }) => (result.content as Array<{ text: string }>)[0]?.text;

describe('MCP input requests', () => {
  it('answers two input rounds from a modern server and names the owner', async () => {
    const asked = answerWith(pick('Acme', true), pick('emea'));
    const manager = await startModernServer();

    const result = await manager.callTool('crm', 'create_contact', {});

    expect(text(result)).toBe('Acme/emea');
    expect(asked.map((question) => question.context?.source)).toEqual(['MCP · crm · create_contact', 'MCP · crm · create_contact']);
    expect(asked[0]?.type).toBe('questionnaire');
  });

  it('sends a decline when the user picks Decline', async () => {
    answerWith(pick(DECLINE_VALUE));
    const manager = await startModernServer();

    expect(text(await manager.callTool('crm', 'create_contact', {}))).toBe('ended: decline');
  });

  it('answers a legacy elicitation/create request through the same path', async () => {
    const asked = answerWith(pick('Globex', true));
    const { call } = await connectLegacyServer();

    expect(text(await call())).toBe('accept:{"name":"Globex"}');
    expect(asked[0]?.context?.source).toBe('MCP · legacy-crm · rename');
  });

  it('sends cancel when the user cancels the question', async () => {
    answerWith(cancel);
    const { call } = await connectLegacyServer();

    expect(text(await call())).toBe('cancel:{}');
  });

  it('declines at once when no question UI is listening', async () => {
    expect(bus.listenerCount(USER_FEEDBACK_QUESTION_REQUEST_EVENT)).toBe(0);
    const { call } = await connectLegacyServer();

    expect(text(await call())).toBe('decline:{}');
  });
});
