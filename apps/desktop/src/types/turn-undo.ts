export interface ChatTurnUndoRef {
  kind: 'turn-undo';
  workspaceId: string;
  /** Backing snapshot identifier. In Phase 2 this is still the VCS checkpoint SHA. */
  snapshotId: string;
  /** Pi session entry id for the user prompt this undo rewinds. */
  targetUserEntryId: string;
  /** User-facing summary shown in chat undo affordances. */
  label: string;
  createdAt: string;
}

export interface ChatComposerPrefill {
  /** Stable ID so identical text can be re-applied as a new request. */
  requestId: string;
  text: string;
  source: 'turn-undo' | 'system';
}
