export interface ChatTurnUndoRef {
  /** Legacy restore target. Phase 2 will swap this to internal turn-undo snapshots. */
  kind: 'checkpoint';
  changeId: string;
  /** User-facing summary shown in chat restore affordances. */
  label: string;
  createdAt: string;
}

export interface ChatComposerPrefill {
  /** Stable ID so identical text can be re-applied as a new request. */
  requestId: string;
  text: string;
  source: 'turn-undo' | 'system';
}
