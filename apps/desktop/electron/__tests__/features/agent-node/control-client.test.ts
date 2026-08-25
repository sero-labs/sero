import { describe, expect, it, vi } from 'vitest';
import { ControlClient, ControlVersionError } from '@electron/features/agent-node/control-client';
import { PinnedTransport } from '@electron/features/agent-node/pinned-transport';

describe('Agent Node control client', () => {
  it('sends and requires control version 1', async () => {
    const transport = new PinnedTransport('https://spark.test', 'ab'.repeat(32));
    const request = vi.spyOn(transport, 'request').mockResolvedValue({
      status: 200,
      headers: { 'sero-control-version': '1' },
      body: Buffer.from('{"healthy":true}'),
    });
    await new ControlClient(transport, 'https://spark.test/sero/v1', 'secret').call('getNodeHealth', {});
    expect(request.mock.calls[0]?.[2]?.headers).toMatchObject({
      'Sero-Control-Version': '1',
      Authorization: 'Bearer secret',
    });
  });

  it('reports deterministic version skew without disabling A2A', async () => {
    const transport = new PinnedTransport('https://spark.test', 'ab'.repeat(32));
    vi.spyOn(transport, 'request').mockResolvedValue({
      status: 409,
      headers: { 'sero-control-version': '2' },
      body: Buffer.from('{"error":{"code":"version_mismatch","message":"use version 2"}}'),
    });
    const control = new ControlClient(transport, 'https://spark.test/sero/v1', 'secret');
    await expect(control.call('listSessions', {})).rejects.toBeInstanceOf(ControlVersionError);
  });
});
