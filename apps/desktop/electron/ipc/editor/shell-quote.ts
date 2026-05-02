/**
 * Quote a string for safe inclusion in a POSIX shell command.
 *
 * Wraps the value in single quotes and escapes any embedded single quotes
 * via the standard `'\''` trick. This is the only way arbitrary file paths
 * (which can contain apostrophes, spaces, $, backticks, etc.) get pasted
 * into container `exec` commands without becoming injection vectors.
 *
 * Lives in its own module so it can be unit-tested without importing the
 * Electron-dependent editor IPC module.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
