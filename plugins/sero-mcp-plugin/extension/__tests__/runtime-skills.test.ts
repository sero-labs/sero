import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer, ProtocolError } from '@modelcontextprotocol/server';
import {
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  type UserFeedbackPendingQuestion,
} from '@sero-ai/common';
import { afterEach, describe, expect, it } from 'vitest';
import { McpServerManager } from '../manager/server-manager';
import { createRuntimeSkills } from '../runtime/runtime-skills';
import { RemoteSkillRegistry } from '../skills/skill-registry';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const SKILL_URI = 'skill://review/SKILL.md';

/** A server with one skill whose SKILL.md asks for allowed-tools. It records every method it gets. */
async function startSkillServer() {
  const state = { skillMd: '---\nname: review\ndescription: Reviews a change.\nallowed-tools: Bash\n---\nRun `git diff`.\n' };
  const requests: string[] = [];
  const entry = () => {
    const bytes = Buffer.from(state.skillMd);
    return {
      uri: SKILL_URI,
      frontmatter: { name: 'review', description: 'Reviews a change.', 'allowed-tools': 'Bash' },
      resources: [{ uri: SKILL_URI, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, size: bytes.length }],
    };
  };
  const createServer = () => {
    const server = new McpServer({ name: 'docs', version: '1.0.0' }, { capabilities: { extensions: { 'io.modelcontextprotocol/skills': {} } } });
    server.registerResource('review', SKILL_URI, { mimeType: 'text/markdown' }, async () => ({ contents: [{ uri: SKILL_URI, text: state.skillMd }] }));
    server.server.fallbackRequestHandler = async (request) => {
      if (request.method === 'skills/list') return { skills: [entry()], ttlMs: 0, cacheScope: 'public' };
      if (request.method === 'skills/get') return { skill: entry(), ttlMs: 0, cacheScope: 'public' };
      throw new ProtocolError(-32601, 'Method not found');
    };
    return server;
  };
  const handler = toNodeHandler(createMcpHandler(createServer));
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const message = body ? JSON.parse(body) as { method?: string } : undefined;
      if (message?.method) requests.push(message.method);
      void handler(req, res, message);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, requests, state };
}

async function setup() {
  const server = await startSkillServer();
  const manager = new McpServerManager({ features: { apps: true, tasks: true, skills: true } });
  cleanups.push(() => manager.closeAll());
  const registry = new RemoteSkillRegistry(path.join(await mkdtemp(path.join(tmpdir(), 'mcp-runtime-skills-')), 'skills.json'));
  const definition = { transport: 'http' as const, url: server.url };
  const skills = createRuntimeSkills({ manager, registry, connect: (name) => manager.connect(name, definition) });
  const connection = await manager.connect('docs', definition);
  await skills.refreshServer('docs', connection);
  return { server, skills, registry, connection };
}

function answerWith(value: string | null) {
  const bus = getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => new EventEmitter());
  const asked: UserFeedbackPendingQuestion[] = [];
  const listener = (question: UserFeedbackPendingQuestion) => {
    asked.push(question);
    setImmediate(() => bus.emit(getUserFeedbackAnswerEvent(question.id), value === null
      ? { id: question.id, cancelled: true, answers: [] }
      : { id: question.id, cancelled: false, answers: [{ questionId: 'skill-code', value, label: value, wasCustom: false }] }));
  };
  bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, listener);
  cleanups.push(() => { bus.off(USER_FEEDBACK_QUESTION_REQUEST_EVENT, listener); });
  return asked;
}

describe('runtime remote skills', () => {
  it('lists skills without fetching any skill file', async () => {
    const { server, registry } = await setup();

    expect((await registry.list()).map((skill) => skill.uri)).toEqual([SKILL_URI]);
    expect(server.requests).toContain('skills/list');
    expect(server.requests).not.toContain('resources/read');
  });

  it('puts only enabled skills in the prompt block, with their server label', async () => {
    const { skills, registry } = await setup();
    expect(await skills.promptBlock()).toBe('');

    await registry.setEnabled('docs', SKILL_URI, true);

    const block = await skills.promptBlock();
    expect(block).toContain('## Remote MCP skills');
    expect(block).toContain('- docs / review: Reviews a change.');
  });

  it('blocks bash for a loaded skill until the user allows it, and ignores allowed-tools', async () => {
    const { skills, registry } = await setup();
    await registry.setEnabled('docs', SKILL_URI, true);
    expect(await skills.checkToolCall('chat-1', 'bash')).toBeUndefined();
    expect(await skills.proxyAction('skill_load', { serverName: 'docs', skill: 'review', sessionId: 'chat-1' }))
      .toMatchObject({ content: [{ text: expect.stringContaining('<mcp-skill server="docs"') }] });

    answerWith('deny');
    expect(await skills.checkToolCall('chat-1', 'bash')).toMatchObject({ block: true });
    expect(await skills.checkToolCall('chat-1', 'read')).toBeUndefined();
  });

  it('keeps an approval for the manifest and asks again after the skill changes', async () => {
    const { skills, registry, server, connection } = await setup();
    await registry.setEnabled('docs', SKILL_URI, true);
    await skills.proxyAction('skill_load', { serverName: 'docs', skill: 'review', sessionId: 'chat-1' });
    const asked = answerWith('allow');

    expect(await skills.checkToolCall('chat-1', 'bash')).toBeUndefined();
    expect(await skills.checkToolCall('chat-1', 'run_code')).toBeUndefined();
    expect(asked).toHaveLength(1);

    server.state.skillMd += 'Also run `rm -rf build`.\n';
    await skills.refreshServer('docs', connection);

    expect(await skills.checkToolCall('chat-1', 'bash')).toMatchObject({ block: true });
    expect((await registry.get('docs', SKILL_URI))?.changed).toBe(true);
  });
});
