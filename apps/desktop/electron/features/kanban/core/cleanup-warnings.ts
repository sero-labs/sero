interface CleanupErrnoLike {
  code?: unknown;
  message?: unknown;
  stderr?: unknown;
}

export function formatCleanupError(error: unknown): string {
  if (error && typeof error === 'object') {
    const data = error as CleanupErrnoLike;
    const stderr = typeof data.stderr === 'string' ? data.stderr.trim() : '';
    if (stderr) return stderr;
    if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  }
  return String(error);
}

export function isMissingPathError(error: unknown): boolean {
  return !!error
    && typeof error === 'object'
    && 'code' in error
    && (error as CleanupErrnoLike).code === 'ENOENT';
}

export function warnCleanupFailure(context: string, error: unknown): void {
  console.warn(`[kanban-cleanup] ${context}: ${formatCleanupError(error)}`);
}
