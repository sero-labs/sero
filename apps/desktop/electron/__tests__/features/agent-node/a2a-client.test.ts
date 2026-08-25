import { describe, expect, it, vi } from 'vitest';
import { A2aClient } from '@electron/features/agent-node/a2a-client';
import { PinnedTransport } from '@electron/features/agent-node/pinned-transport';

describe('Agent Node A2A 1.0 client', () => {
  it('sends the required version and bearer headers', async () => {
    const transport = new PinnedTransport('https://spark.test', 'ab'.repeat(32));
    const request = vi.spyOn(transport, 'request').mockResolvedValue({
      status: 200,
      headers: {},
      body: Buffer.from('{"jsonrpc":"2.0","id":"reply","result":{"ok":true}}'),
    });
    await new A2aClient(transport, 'https://spark.test/', 'secret-token').getTask('task-1');

    const options = request.mock.calls[0]?.[2];
    expect(options?.headers).toMatchObject({
      'A2A-Version': '1.0',
      Authorization: 'Bearer secret-token',
    });
    expect(JSON.parse(options?.body ?? '{}')).toMatchObject({ method: 'tasks/get', params: { id: 'task-1' } });
  });

  it('exposes only the five specified A2A operations', () => {
    const operations = Object.getOwnPropertyNames(A2aClient.prototype)
      .filter((name) => !['constructor', 'headers', 'call', 'stream'].includes(name));
    expect(operations).toEqual([
      'sendMessage',
      'streamMessage',
      'getTask',
      'cancelTask',
      'subscribeTask',
    ]);
  });
});
