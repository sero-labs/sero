import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayClient } from '@/lib/gateway-client';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.emitClose(code, reason);
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitMessage(message: unknown): void {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify(message),
      }),
    );
  }

  emitClose(code = 1000, reason = ''): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

describe('GatewayClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    MockWebSocket.reset();
  });

  it('keeps reconnects enabled after transient connect errors and retries immediately', () => {
    const client = new GatewayClient('ws://gateway.test');
    const disconnectEvents: Array<{ code: number; reason: string; willReconnect: boolean }> = [];

    client.onDisconnect((event) => {
      disconnectEvents.push(event);
    });

    client.connect('saved-token');

    const firstSocket = MockWebSocket.instances[0];
    expect(firstSocket).toBeDefined();

    firstSocket!.emitOpen();
    expect(JSON.parse(firstSocket!.sent[0])).toMatchObject({
      type: 'connect',
      token: 'saved-token',
      clientType: 'web',
    });

    firstSocket!.emitMessage({
      type: 'error',
      requestType: 'connect',
      message: 'Too many authentication attempts. Try again later.',
    });
    firstSocket!.emitClose(4029, 'Rate limited');

    expect(client.state).toBe('reconnecting');
    expect(disconnectEvents).toEqual([
      { code: 4029, reason: 'Rate limited', willReconnect: true },
    ]);

    client.retryNow();

    const secondSocket = MockWebSocket.instances[1];
    expect(secondSocket).toBeDefined();

    secondSocket!.emitOpen();
    expect(JSON.parse(secondSocket!.sent[0])).toMatchObject({
      type: 'connect',
      token: 'saved-token',
      clientType: 'web',
    });

    vi.advanceTimersByTime(3000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('stops reconnecting after invalid authentication tokens', () => {
    const client = new GatewayClient('ws://gateway.test');
    const disconnectEvents: Array<{ code: number; reason: string; willReconnect: boolean }> = [];

    client.onDisconnect((event) => {
      disconnectEvents.push(event);
    });

    client.connect('bad-token');

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket!.emitOpen();
    socket!.emitMessage({
      type: 'error',
      requestType: 'connect',
      message: 'Invalid authentication token',
    });
    socket!.emitClose(4003, 'Authentication failed');

    expect(client.state).toBe('disconnected');
    expect(disconnectEvents).toEqual([
      { code: 4003, reason: 'Authentication failed', willReconnect: false },
    ]);

    client.retryNow();
    vi.advanceTimersByTime(3000);

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('sends explicit workspace scope when creating web tokens', () => {
    const client = new GatewayClient('ws://gateway.test');
    client.connect('master-token');

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket!.emitOpen();
    socket!.sent = [];

    client.createWebToken(null, 'Owner device', 7);
    client.createWebToken(['workspace-a'], 'Workspace A only', 3);

    expect(socket!.sent.map((payload) => JSON.parse(payload))).toEqual([
      {
        type: 'create_web_token',
        workspaceIds: null,
        label: 'Owner device',
        expiryDays: 7,
      },
      {
        type: 'create_web_token',
        workspaceIds: ['workspace-a'],
        label: 'Workspace A only',
        expiryDays: 3,
      },
    ]);
  });
});
