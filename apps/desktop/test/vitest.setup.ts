import os from 'node:os';
import path from 'node:path';

process.env.SERO_FIXED_ROOT_OVERRIDE ??= path.join(os.tmpdir(), 'sero-vitest', String(process.pid));

const QUIET_PATTERNS = [
  /^\[github-auth\]/,
  /^\[memory\]/,
  /^\[app-store\]/,
  /^\[dev-server\]/,
  /^\[review-executor\]/,
  /^\[sero:profile\]/,
  /^\[wave-resolver\]/,
  /^\[file-watcher\]/,
  /^\[worktree-git\]/,
];

function shouldSuppress(args: unknown[]): boolean {
  const [first] = args;
  if (typeof first !== 'string') return false;
  return QUIET_PATTERNS.some((pattern) => pattern.test(first));
}

function wrapConsoleMethod<T extends (...args: any[]) => void>(method: T): T {
  return ((...args: unknown[]) => {
    if (shouldSuppress(args)) return;
    method(...(args as Parameters<T>));
  }) as T;
}

console.log = wrapConsoleMethod(console.log.bind(console));
console.warn = wrapConsoleMethod(console.warn.bind(console));
console.error = wrapConsoleMethod(console.error.bind(console));
