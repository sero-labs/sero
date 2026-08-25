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
    expect(JSON.parse(options?.body ?? '{}')).toMatchObject({ method: 'GetTask', params: { id: 'task-1' } });
  });

  it('uses canonical A2A 1.0 method names for every request', async () => {
    const transport = new PinnedTransport('https://spark.test', 'ab'.repeat(32));
    const request = vi.spyOn(transport, 'request').mockResolvedValue({
      status: 200, headers: {}, body: Buffer.from('{"jsonrpc":"2.0","id":"reply","result":{}}'),
    });
    const open = vi.spyOn(transport, 'open').mockRejectedValue(new Error('stop after request'));
    const client = new A2aClient(transport, 'https://spark.test/', 'secret-token');
    await client.sendMessage({ message: {} });
    await client.getTask('task-1');
    await client.cancelTask('task-1');
    await expect(client.streamMessage({ message: {} }, vi.fn())).rejects.toThrow('stop after request');
    await expect(client.subscribeTask('task-1', vi.fn())).rejects.toThrow('stop after request');
    expect(request.mock.calls.map((call) => JSON.parse(call[2]?.body ?? '{}').method)).toEqual([
      'SendMessage', 'GetTask', 'CancelTask',
    ]);
    expect(open.mock.calls.map((call) => JSON.parse(call[3] ?? '{}').method)).toEqual([
      'SendStreamingMessage', 'SubscribeToTask',
    ]);
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
