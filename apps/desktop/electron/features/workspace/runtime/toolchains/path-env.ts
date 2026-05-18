import path from 'path';

export type PathEnv = Record<string, string | undefined>;

export function pathEnvKey(
  env: PathEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return 'PATH';
  const existing = Object.keys(env).find((key) => key.toLowerCase() === 'path');
  return existing ?? 'Path';
}

export function pathEnvValue(
  env: PathEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  return env[pathEnvKey(env, platform)] ?? '';
}

export function prependPathEntries(
  env: PathEnv,
  entries: string[],
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const key = pathEnvKey(env, platform);
  const delimiter = pathDelimiter(platform);
  const cleanEntries = entries.filter((entry) => entry.length > 0);
  const existing = env[key] ?? '';
  const nextPath = [...cleanEntries, existing].filter((entry) => entry.length > 0).join(delimiter);
  return { ...withoutDuplicateWindowsPathKeys(env, key, platform), [key]: nextPath };
}

function withoutDuplicateWindowsPathKeys(
  env: PathEnv,
  pathKey: string,
  platform: NodeJS.Platform,
): PathEnv {
  if (platform !== 'win32') return env;
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => key === pathKey || key.toLowerCase() !== 'path'),
  );
}

function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : path.delimiter;
}
