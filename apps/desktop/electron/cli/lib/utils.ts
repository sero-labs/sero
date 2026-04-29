import type { CliResult } from '../core/types';

export function ok(output: string): CliResult {
  return { output, exitCode: 0 };
}

export function fail(message: string, exitCode = 1): CliResult {
  return { output: `ERROR: ${message}`, exitCode };
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function parseFlags(args: string[]): {
  positionals: string[];
  flags: Map<string, string | true>;
} {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const keyValue = token.slice(2);
    if (!keyValue) continue;

    const eqIdx = keyValue.indexOf('=');
    if (eqIdx !== -1) {
      flags.set(keyValue.slice(0, eqIdx), keyValue.slice(eqIdx + 1));
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(keyValue, next);
      i++;
    } else {
      flags.set(keyValue, true);
    }
  }

  return { positionals, flags };
}

export function requireFlagString(
  flags: Map<string, string | true>,
  key: string,
): string | null {
  const value = flags.get(key);
  return typeof value === 'string' ? value : null;
}
