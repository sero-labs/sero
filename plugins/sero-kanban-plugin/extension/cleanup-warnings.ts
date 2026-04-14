export function formatCleanupWarnings(warnings: string[]): string {
  if (warnings.length === 0) return '';
  return `\nCleanup warnings:\n${warnings.map((warning) => `  • ${warning}`).join('\n')}`;
}
