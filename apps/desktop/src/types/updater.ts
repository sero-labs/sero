/** Auto-update lifecycle state surfaced to the renderer. */
type UpdaterState =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdaterStatusEvent {
  state: UpdaterState;
  /** Target version for `available` / `downloaded`. */
  version?: string;
  /** Download progress percent (0–100) while `downloading`. */
  percent?: number;
  /** Human-readable message for `error`. */
  message?: string;
  /** True when the check was triggered by an explicit user action. */
  manual?: boolean;
}
