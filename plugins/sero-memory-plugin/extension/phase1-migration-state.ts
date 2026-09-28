interface Phase1MigrationState {
  checked: boolean;
  changed: boolean;
}

const migrationState = new Map<string, Phase1MigrationState>();

export function clearPhase1MigrationState(sessionId: string): void {
  migrationState.delete(sessionId);
}

export function setPhase1MigrationState(
  sessionId: string,
  changed: boolean,
): void {
  migrationState.set(sessionId, { checked: true, changed });
}

export function getPhase1MigrationState(
  sessionId: string,
): Phase1MigrationState | null {
  return migrationState.get(sessionId) ?? null;
}
