import { deterministicRetryDelay, type SseConnection, type SseMessage } from './sse';

const TERMINAL_ERROR_NAMES = new Set([
  'ControlAuthorizationError',
  'ControlNotFoundError',
  'ControlVersionError',
]);

export type StreamOpener = (
  cursor: string | undefined,
  onMessage: (message: SseMessage) => void,
) => Promise<SseConnection>;

export class RetryingStream {
  private stopped = false;
  private closeCurrent: (() => void) | null = null;
  private attempt = 0;
  private cursor: string | undefined;

  constructor(
    private readonly open: StreamOpener,
    private readonly onMessage: (message: SseMessage) => void,
    cursor?: string,
  ) {
    this.cursor = cursor;
  }

  async start(): Promise<void> {
    while (!this.stopped) {
      try {
        const connection = await this.open(this.cursor, (message) => {
          if (message.id) this.cursor = message.id;
          this.attempt = 0;
          this.onMessage(message);
        });
        this.closeCurrent = connection.close;
        await connection.done;
        if (!this.stopped) throw new Error('Agent node stream closed');
      } catch (error) {
        if (this.stopped) return;
        if (error instanceof Error && TERMINAL_ERROR_NAMES.has(error.name)) throw error;
        const delay = deterministicRetryDelay(this.attempt++);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.closeCurrent?.();
    this.closeCurrent = null;
  }

  getCursor(): string | null {
    return this.cursor ?? null;
  }
}
