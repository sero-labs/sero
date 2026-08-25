import { deterministicRetryDelay, type SseConnection, type SseMessage } from './sse';

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
        const delay = deterministicRetryDelay(this.attempt++);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (error instanceof Error
          && (error.name === 'ControlVersionError' || error.name === 'ControlAuthorizationError')) throw error;
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
