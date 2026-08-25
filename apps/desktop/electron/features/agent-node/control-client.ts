import type { AgentNodeControlOperation } from '@/types/ipc-agent-node';
import { SERO_CONTROL_VERSION } from '@sero-ai/a2a';
import type { PinnedTransport } from './pinned-transport';
import { JsonHttpError, parseJson, postJson } from './http-json';
import { isRecord } from './types';
import { consumeSse, type SseConnection, type SseMessage } from './sse';

export class ControlVersionError extends Error {
  constructor() {
    super('Agent node control-plane version is incompatible');
    this.name = 'ControlVersionError';
  }
}

export class ControlClient {
  constructor(
    private readonly transport: PinnedTransport,
    private readonly baseUrl: string,
    private readonly token: string | null,
  ) {}

  async call(operation: AgentNodeControlOperation, params: Record<string, unknown>): Promise<unknown> {
    try {
      const { value, headers } = await postJson(
        this.transport,
        this.path(operation),
        params,
        this.headers(operation !== 'enrol'),
      );
      this.checkVersion(headers['sero-control-version']);
      return value;
    } catch (error) {
      if (error instanceof JsonHttpError && error.code === 'version_mismatch') {
        throw new ControlVersionError();
      }
      throw error;
    }
  }

  async stream(
    stream: 'events' | 'auth/events',
    onEvent: (message: SseMessage) => void,
    lastEventId?: string,
  ): Promise<SseConnection> {
    return this.openStream(this.path(stream), onEvent, lastEventId);
  }

  async sessionEvents(
    contextId: string,
    cursor: string | undefined,
    onEvent: (message: SseMessage) => void,
  ): Promise<SseConnection> {
    const url = new URL(this.path(`sessions/${encodeURIComponent(contextId)}/events`));
    if (cursor) url.searchParams.set('cursor', cursor);
    return this.openStream(url.toString(), onEvent, cursor);
  }

  async readBlob(blobId: string): Promise<Uint8Array> {
    const response = await this.transport.request('GET', this.path(`blob/${encodeURIComponent(blobId)}`), {
      headers: this.headers(true),
      maxBytes: 256 * 1024 * 1024,
    });
    this.checkVersion(response.headers['sero-control-version']);
    if (response.status < 200 || response.status >= 300) {
      const value = parseJson(response.body);
      const error = isRecord(value) && isRecord(value.error) ? value.error : null;
      throw new Error(error && typeof error.message === 'string' ? error.message : `Blob read failed: HTTP ${response.status}`);
    }
    return new Uint8Array(response.body);
  }

  private async openStream(
    path: string,
    onEvent: (message: SseMessage) => void,
    lastEventId?: string,
  ): Promise<SseConnection> {
    const headers = this.headers(true);
    headers.Accept = 'text/event-stream';
    if (lastEventId) headers['Last-Event-ID'] = lastEventId;
    const response = await this.transport.open('GET', path, headers);
    this.checkVersion(response.headers['sero-control-version']);
    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error(`Agent node stream returned HTTP ${response.statusCode ?? 0}`);
    }
    return { close: () => response.destroy(), done: consumeSse(response, onEvent) };
  }

  private path(operation: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${operation}`;
  }

  private headers(authenticated: boolean): Record<string, string> {
    if (authenticated && !this.token) throw new Error('Agent node is not enrolled for this profile');
    return {
      'Sero-Control-Version': SERO_CONTROL_VERSION,
      ...(authenticated ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private checkVersion(header: string | string[] | undefined): void {
    const value = Array.isArray(header) ? header[0] : header;
    if (value !== SERO_CONTROL_VERSION) throw new ControlVersionError();
  }
}
