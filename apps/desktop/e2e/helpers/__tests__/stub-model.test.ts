import { afterEach, describe, expect, it } from 'vitest';

import { startStubModel, type StubModelServer } from '../stub-model';

describe('stub model server', () => {
  let server: StubModelServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('answers a request with the scripted tool call and records what the session sent', async () => {
    server = await startStubModel(() => ({
      toolCalls: [{ id: 'call-1', name: 'read', arguments: { path: 'probe.txt' } }],
    }));

    const response = await fetch(`${server.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'stub-model',
        stream: true,
        messages: [
          { role: 'system', content: 'SYSTEM PROMPT' },
          { role: 'user', content: 'hello' },
        ],
        tools: [{ type: 'function', function: { name: 'read', description: 'Read a file', parameters: {} } }],
      }),
    });
    const events = (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
      .map((line) => JSON.parse(line.slice(6)) as { choices: Array<{ delta?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> });
    const call = events.flatMap((event) => event.choices.flatMap((choice) => choice.delta?.tool_calls ?? []))[0];

    expect(call?.function.name).toBe('read');
    expect(JSON.parse(call?.function.arguments ?? '{}')).toEqual({ path: 'probe.txt' });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.system).toBe('SYSTEM PROMPT');
    expect(server.requests[0]?.tools.map((tool) => tool.name)).toEqual(['read']);
  });
});
