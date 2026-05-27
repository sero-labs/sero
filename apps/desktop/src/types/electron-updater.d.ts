import type { UpdaterStatusEvent } from './updater';

export interface SeroUpdaterAPI {
  /** Trigger a manual update check (also wired to the app menu). */
  check(): Promise<void>;
  /** Get the latest known updater status. */
  getStatus(): Promise<UpdaterStatusEvent>;
  /** Quit and install a downloaded update, relaunching afterwards. */
  restartToUpdate(): Promise<void>;
  /** Subscribe to updater status changes. Returns an unsubscribe fn. */
  onEvent(handler: (event: UpdaterStatusEvent) => void): () => void;
}
