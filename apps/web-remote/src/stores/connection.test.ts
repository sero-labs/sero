import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createConnectionStore,
  type GatewayClientLike,
} from '@/stores/connection';
import type {
  ConnectionState,
  DisconnectEvent,
  GatewayMessage,
} from '@/lib/gateway-client';

class FakeGatewayClient implements GatewayClientLike {
  private stateHandlers = new Set<(state: ConnectionState) => void>();
  private messageHandlers = new Set<(msg: GatewayMessage) => void>();
  private disconnectHandlers = new Set<(event: DisconnectEvent) => void>();

  connectCalls: string[] = [];
  disconnectCalls = 0;
  retryCalls = 0;

  onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onMessage(handler: (msg: GatewayMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: (event: DisconnectEvent) => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  connect(token: string): void {
    this.connectCalls.push(token);
  }

  disconnect(): void {
    this.disconnectCalls += 1;
  }

  retryNow(): void {
    this.retryCalls += 1;
  }

  sendPrompt(): void {}

  requestWorkspaces(): void {}

  requestSessions(): void {}
  searchSessions(): void {}
  requestUsage(): void {}
  answerChoice(): void {}
  listNotifications(): void {}
  markNotificationsRead(): void {}
  uploadFile(): void {}
  gitStatus(): void {}
  gitDiff(): void {}
  gitCommit(): void {}

  createSession(): void {}

  abortSession(): void {}

  requestSessionHistory(): void {}

  listFiles(): void {}

  readFile(): void {}

  listArtifacts(): void {}

  getArtifact(): void {}

  listDevServers(): void {}

  createDevServerTicket(): void {}

  listRemoteWidgets<T>(): Promise<T> {
    return Promise.resolve([] as unknown as T);
  }

  appStateGet<T>(): Promise<T> {
    return Promise.resolve({ data: null, etag: null } as unknown as T);
  }

  appStateWatch<T>(): Promise<T> {
    return Promise.resolve({ data: null, etag: null } as unknown as T);
  }

  appStateSet<T>(): Promise<T> {
    return Promise.resolve({ ok: true, etag: 'e1' } as unknown as T);
  }

  pushStatus<T>(): Promise<T> {
    return Promise.resolve({ enabled: false, publicKey: null } as unknown as T);
  }

  pushSubscribe<T>(): Promise<T> {
    return Promise.resolve({ subscribed: true } as unknown as T);
  }

  pushUnsubscribe<T>(): Promise<T> {
    return Promise.resolve({ removed: true } as unknown as T);
  }

  appStateUnwatch(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  voiceStatus(): Promise<{ enabled: boolean; reason?: string }> {
    return Promise.resolve({ enabled: false, reason: 'Not configured in tests.' });
  }

  transcribeVoice(): Promise<{ text: string; model: string }> {
    return Promise.resolve({ text: '', model: 'test' });
  }

  emitState(state: ConnectionState): void {
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  emitMessage(message: GatewayMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  emitDisconnect(event: DisconnectEvent): void {
    for (const handler of this.disconnectHandlers) {
      handler(event);
    }
  }
}

function createStorage(loadValue: string | null = null) {
  return {
    save: vi.fn(async () => {}),
    load: vi.fn(async () => loadValue),
    clear: vi.fn(async () => {}),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('connection store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('bootstraps from a stored token and connects once', async () => {
    const client = new FakeGatewayClient();
    const storage = createStorage('stored-token');
    const store = createConnectionStore(client, storage);

    await store.getState().initialize();

    expect(storage.load).toHaveBeenCalledTimes(1);
    expect(client.connectCalls).toEqual(['stored-token']);
    expect(store.getState().token).toBe('stored-token');
    expect(store.getState().isInitialized).toBe(true);
    expect(store.getState().isBootstrapping).toBe(false);
  });

  it('prefers a QR token from the URL and removes it from the address bar', async () => {
    const client = new FakeGatewayClient();
    const storage = createStorage('stored-token');
    const store = createConnectionStore(client, storage);

    window.history.replaceState({}, '', '/remote?foo=bar&token=url-token#chat');

    await store.getState().initialize();

    expect(storage.load).not.toHaveBeenCalled();
    expect(client.connectCalls).toEqual(['url-token']);
    expect(store.getState().token).toBe('url-token');
    expect(window.location.search).toBe('?foo=bar');
    expect(window.location.hash).toBe('#chat');
  });

  it('saves the token on successful auth and clears invalid tokens on auth failure', async () => {
    const client = new FakeGatewayClient();
    const storage = createStorage();
    const store = createConnectionStore(client, storage);

    store.getState().connect('valid-token');
    client.emitMessage({ type: 'ok', requestType: 'connect' });

    expect(storage.save).toHaveBeenCalledWith('valid-token');

    store.getState().connect('bad-token');
    client.emitMessage({
      type: 'error',
      requestType: 'connect',
      message: 'Invalid authentication token',
    });

    expect(storage.clear).toHaveBeenCalledTimes(1);
    expect(store.getState().token).toBeNull();
    expect(store.getState().authError).toBe('Invalid authentication token');
    expect(store.getState().requestError).toBeNull();
  });

  it('keeps the saved token when connect fails for a transient reason', () => {
    const client = new FakeGatewayClient();
    const storage = createStorage();
    const store = createConnectionStore(client, storage);

    store.getState().connect('saved-token');
    client.emitMessage({
      type: 'error',
      requestType: 'connect',
      message: 'Too many authentication attempts. Try again later.',
    });

    expect(storage.clear).not.toHaveBeenCalled();
    expect(store.getState().token).toBe('saved-token');
    expect(store.getState().authError).toBeNull();
    expect(store.getState().disconnectReason).toBe(
      'Too many authentication attempts. Try again later.',
    );
    expect(store.getState().requestError).toBeNull();
  });

  it('does not restore a stored token after the user switches tokens mid-bootstrap', async () => {
    const client = new FakeGatewayClient();
    const deferred = createDeferred<string | null>();
    const storage = {
      save: vi.fn(async () => {}),
      load: vi.fn(() => deferred.promise),
      clear: vi.fn(async () => {}),
    };
    const store = createConnectionStore(client, storage);

    const initializePromise = store.getState().initialize();

    expect(store.getState().isBootstrapping).toBe(true);

    store.getState().disconnect();
    store.getState().connect('manual-token');

    deferred.resolve('stored-token');
    await initializePromise;

    expect(storage.clear).toHaveBeenCalledTimes(1);
    expect(client.connectCalls).toEqual(['manual-token']);
    expect(store.getState().token).toBe('manual-token');
    expect(store.getState().isInitialized).toBe(true);
    expect(store.getState().isBootstrapping).toBe(false);
  });

  it('captures non-auth request errors and clears them after a successful retry', () => {
    const client = new FakeGatewayClient();
    const storage = createStorage();
    const store = createConnectionStore(client, storage);

    client.emitMessage({
      type: 'error',
      requestType: 'get_session_history',
      message: 'Session not authorized: session-b',
    });

    expect(store.getState().requestError).toEqual({
      requestType: 'get_session_history',
      message: 'Session not authorized: session-b',
    });

    client.emitMessage({
      type: 'ok',
      requestType: 'get_session_history',
      data: [],
    });

    expect(store.getState().requestError).toBeNull();
  });

  it('stays in reconnect mode after transport loss and supports immediate retry', () => {
    const client = new FakeGatewayClient();
    const storage = createStorage();
    const store = createConnectionStore(client, storage);

    store.getState().connect('saved-token');
    client.emitState('reconnecting');
    client.emitDisconnect({ code: 1006, reason: '', willReconnect: true });

    expect(store.getState().token).toBe('saved-token');
    expect(store.getState().state).toBe('reconnecting');
    expect(store.getState().disconnectReason).toBe(
      'Connection lost. Reconnecting automatically...',
    );

    store.getState().retry();

    expect(client.retryCalls).toBe(1);
    expect(store.getState().disconnectReason).toBeNull();
    expect(store.getState().requestError).toBeNull();
  });
});
