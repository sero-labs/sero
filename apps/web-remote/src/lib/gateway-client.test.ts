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

  /**
   * A real socket closes asynchronously: the close event lands after the
   * caller has moved on, and often after a replacement socket exists.
   * `deferClose` reproduces that. The default stays synchronous so the
   * tests written against it keep their original timing.
   */
  static deferClose = false;

  close(code = 1000, reason = ''): void {
    if (MockWebSocket.deferClose) {
      this.readyState = MockWebSocket.CLOSING;
      // Held until the test releases it, standing in for the event loop.
      this.pendingClose = { code, reason };
      return;
    }
    this.emitClose(code, reason);
  }

  /** A close asked for but not yet delivered. */
  pendingClose: { code: number; reason: string } | null = null;

  /** Deliver a close the socket is still holding. */
  flushClose(): void {
    const pending = this.pendingClose;
    if (!pending) return;
    this.pendingClose = null;
    this.readyState = MockWebSocket.CONNECTING;
    this.emitClose(pending.code, pending.reason);
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
    MockWebSocket.deferClose = false;
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

  it('drops a queued reconnect when a new token is given', () => {
    // A tab left waiting while the desktop is down has a reconnect
    // queued. Signing in with a new token has to cancel it: firing it
    // later would close the connection that sign-in just made.
    const client = new GatewayClient('ws://gateway.test');

    client.connect('old-token');
    MockWebSocket.instances[0]!.emitClose(1006, '');
    expect(client.state).toBe('reconnecting');

    client.connect('new-token');
    const signedIn = MockWebSocket.instances[1]!;
    signedIn.emitOpen();
    signedIn.emitMessage({ type: 'ok', requestType: 'connect' });
    expect(client.state).toBe('connected');

    vi.advanceTimersByTime(30_000);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(client.state).toBe('connected');
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

  it('correlates voice_transcribe responses by requestId', async () => {
    const client = new GatewayClient('ws://gateway.test');
    client.connect('master-token');

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket!.emitOpen();
    socket!.emitMessage({ type: 'ok', requestType: 'connect' });
    socket!.sent = [];

    const transcribePromise = client.transcribeVoice('data:audio/webm;base64,Zm9v', 'audio/webm');

    expect(socket!.sent).toHaveLength(1);
    const sent = JSON.parse(socket!.sent[0]) as {
      type: string;
      audioDataUrl: string;
      mimeType: string;
      requestId: string;
    };
    expect(sent.type).toBe('voice_transcribe');
    expect(sent.audioDataUrl).toBe('data:audio/webm;base64,Zm9v');
    expect(sent.mimeType).toBe('audio/webm');
    expect(sent.requestId).toMatch(/^req-/);

    socket!.emitMessage({
      type: 'ok',
      requestType: 'voice_transcribe',
      requestId: sent.requestId,
      data: { text: 'hello world', model: 'openai/gpt-4o-mini-transcribe' },
    });

    await expect(transcribePromise).resolves.toEqual({
      text: 'hello world',
      model: 'openai/gpt-4o-mini-transcribe',
    });
  });

  it('rejects pending requests when the gateway error response arrives', async () => {
    const client = new GatewayClient('ws://gateway.test');
    client.connect('master-token');

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket!.emitOpen();
    socket!.emitMessage({ type: 'ok', requestType: 'connect' });
    socket!.sent = [];

    const statusPromise = client.voiceStatus();
    const sent = JSON.parse(socket!.sent[0]) as { requestId: string };

    socket!.emitMessage({
      type: 'error',
      requestType: 'voice_status',
      requestId: sent.requestId,
      message: 'Voice transcription requires an OpenAI API key.',
    });

    await expect(statusPromise).rejects.toThrow(
      'Voice transcription requires an OpenAI API key.',
    );
  });

  it('rejects voiceStatus before authentication completes so the promise never hangs', async () => {
    const client = new GatewayClient('ws://gateway.test');
    client.connect('master-token');

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    // Socket is open but no `connect` ok has been received yet — state is
    // still 'authenticating'. sendRequest must reject synchronously rather
    // than dispatching into a server response that wouldn't echo requestId.
    socket!.emitOpen();

    await expect(client.voiceStatus()).rejects.toThrow(/not connected/i);
  });

  it('rejects oversized voice payloads on the client before sending', async () => {
    const client = new GatewayClient('ws://gateway.test');
    client.connect('master-token');

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket!.emitOpen();
    socket!.emitMessage({ type: 'ok', requestType: 'connect' });
    socket!.sent = [];

    const oversized = `data:audio/webm;base64,${'A'.repeat(36 * 1024 * 1024)}`;
    await expect(client.transcribeVoice(oversized, 'audio/webm')).rejects.toThrow(/too large/i);
    expect(socket!.sent).toHaveLength(0);
  });

  it('settles pending promises when the host echoes requestId on early errors', async () => {
    const client = new GatewayClient('ws://gateway.test');
    client.connect('master-token');

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket!.emitOpen();
    socket!.emitMessage({ type: 'ok', requestType: 'connect' });
    socket!.sent = [];

    const statusPromise = client.voiceStatus();
    const sent = JSON.parse(socket!.sent[0]) as { requestId: string };

    // Simulate an early server error (e.g. agentOps unavailable) that still
    // echoes the requestId so the promise settles instead of timing out.
    socket!.emitMessage({
      type: 'error',
      requestType: 'voice_status',
      requestId: sent.requestId,
      message: 'Agent operations not available',
    });

    await expect(statusPromise).rejects.toThrow('Agent operations not available');
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

  it('keeps the new socket when a replaced one closes late', () => {
    // A real close lands after doConnect has already opened a
    // replacement. The old socket must not speak for the new one.
    MockWebSocket.deferClose = true;
    const client = new GatewayClient('ws://gateway.test');
    const states: string[] = [];
    client.onStateChange((state) => states.push(state));

    client.connect('token-a');
    const first = MockWebSocket.instances[0];
    first.emitOpen();
    first.emitMessage({ type: 'ok', requestType: 'connect' });
    expect(client.state).toBe('connected');

    // A second connect replaces the socket while the first is still closing.
    client.connect('token-b');
    const second = MockWebSocket.instances[1];
    expect(second).toBeDefined();

    // Now the first socket's close finally arrives.
    first.flushClose();

    // It must not have torn down the connection that replaced it.
    second.emitOpen();
    expect(second.sent).toHaveLength(1);
    expect(JSON.parse(second.sent[0])).toMatchObject({ token: 'token-b' });

    second.emitMessage({ type: 'ok', requestType: 'connect' });
    expect(client.state).toBe('connected');
    expect(states).not.toContain('reconnecting');
  });

  it('ignores messages from a socket that has been replaced', () => {
    MockWebSocket.deferClose = true;
    const client = new GatewayClient('ws://gateway.test');
    const seen: string[] = [];
    client.onMessage((msg) => seen.push((msg as { requestType?: string }).requestType ?? msg.type));

    client.connect('token-a');
    const first = MockWebSocket.instances[0];
    first.emitOpen();

    client.connect('token-b');

    // A frame still in flight from the old socket must not be dispatched.
    first.emitMessage({ type: 'ok', requestType: 'list_workspaces', data: [] });

    expect(seen).not.toContain('list_workspaces');
  });

  it('schedules no reconnect for a socket it already let go', () => {
    MockWebSocket.deferClose = true;
    const client = new GatewayClient('ws://gateway.test');

    client.connect('token-a');
    const first = MockWebSocket.instances[0];
    first.emitOpen();
    first.emitMessage({ type: 'ok', requestType: 'connect' });

    client.connect('token-b');
    first.flushClose();

    // Two sockets so far. A stale close must not queue a third.
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
