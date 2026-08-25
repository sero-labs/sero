import { randomUUID } from 'crypto';
import type { PinnedTransport } from './pinned-transport';
import { postJson } from './http-json';
import { A2A_VERSION, type JsonRpcResponse, isRecord } from './types';
import { consumeSse, type SseConnection, type SseMessage } from './sse';

type A2aMethod = 'message/send' | 'message/stream' | 'tasks/get' | 'tasks/cancel' | 'tasks/resubscribe';

export class A2aClient {
  constructor(
    private readonly transport: PinnedTransport,
    private readonly endpoint: string,
    private readonly token: string,
  ) {}

  sendMessage(params: Record<string, unknown>): Promise<unknown> {
    return this.call('message/send', params);
  }

  async streamMessage(params: Record<string, unknown>, onEvent: (message: SseMessage) => void): Promise<SseConnection> {
    return this.stream('message/stream', params, onEvent);
  }

  getTask(taskId: string): Promise<unknown> {
    return this.call('tasks/get', { id: taskId });
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.call('tasks/cancel', { id: taskId });
  }

  async subscribeTask(taskId: string, onEvent: (message: SseMessage) => void): Promise<SseConnection> {
    return this.stream('tasks/resubscribe', { id: taskId }, onEvent);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'A2A-Version': A2A_VERSION };
  }

  private async call(method: A2aMethod, params: Record<string, unknown>): Promise<unknown> {
    const request = { jsonrpc: '2.0', id: randomUUID(), method, params };
    const { value } = await postJson(this.transport, this.endpoint, request, this.headers());
    if (!isRecord(value)) throw new Error('Agent node returned an invalid A2A response');
    const response = value as unknown as JsonRpcResponse<unknown>;
    if (response.error) throw new Error(`${response.error.code}: ${response.error.message}`);
    return response.result;
  }

  private async stream(
    method: A2aMethod,
    params: Record<string, unknown>,
    onEvent: (message: SseMessage) => void,
  ): Promise<SseConnection> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params });
    const response = await this.transport.open('POST', this.endpoint, {
      ...this.headers(),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }, body);
    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error(`Agent node A2A stream returned HTTP ${response.statusCode ?? 0}`);
    }
    return { close: () => response.destroy(), done: consumeSse(response, onEvent) };
  }
}
