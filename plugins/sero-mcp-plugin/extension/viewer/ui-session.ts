import { startUiServer, type UiServerHandle, type UiServerOptions } from './ui-server';

export class McpUiSessionManager {
  private activeSession: UiServerHandle | null = null;

  async open(options: UiServerOptions): Promise<UiServerHandle> {
    await this.closeActive('replaced');

    const handle = await startUiServer({
      ...options,
      onClose: (reason) => {
        if (this.activeSession?.sessionId === handle.sessionId) {
          this.activeSession = null;
        }
        options.onClose?.(reason);
      },
    });

    this.activeSession = handle;
    return handle;
  }

  getActiveSession(): UiServerHandle | null {
    return this.activeSession;
  }

  async closeActive(reason = 'closed'): Promise<void> {
    const current = this.activeSession;
    this.activeSession = null;
    current?.close(reason);
  }

  async closeIfServerMatches(serverName: string): Promise<void> {
    if (this.activeSession?.serverName === serverName) {
      await this.closeActive('server-config-changed');
    }
  }
}
