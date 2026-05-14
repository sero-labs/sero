export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function shellEnvAssignment(key: string, value: string): string {
  if (!ENV_KEY_RE.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
  return `${key}=${shellQuote(value)}`;
}

export function buildDevServerLaunchCommand(command: string, logPath: string): string {
  return `setsid sh -c ${shellQuote(`exec ${command} > ${shellQuote(logPath)} 2>&1`)} >/dev/null 2>&1 & echo $!`;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function emitData(callbacks: Set<(chunk: string) => void>, chunk: Buffer): void {
  const text = chunk.toString();
  for (const cb of callbacks) cb(text);
}

export function subscribe<T>(callbacks: Set<(value: T) => void>, cb: (value: T) => void): () => void {
  callbacks.add(cb);
  return () => callbacks.delete(cb);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
