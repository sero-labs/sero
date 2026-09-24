import os from 'os';
import path from 'path';

// A test process must never resolve the machine's real ~/.sero-ui. Give every
// worker an isolated root unless the test sets its own.
//
// SERO_FIXED_ROOT_OVERRIDE stays unset on purpose: it outranks
// SERO_HOME_OVERRIDE, so setting it here would shadow per-test roots.
// See electron/features/profile/roots.ts.
const isolatedRoot = path.join(os.tmpdir(), `sero-vitest-${process.pid}`);
process.env.SERO_HOME_OVERRIDE ??= isolatedRoot;
process.env.SERO_HOST_ARTIFACTS_ROOT_OVERRIDE ??= isolatedRoot;

// jsdom has no ResizeObserver, but Radix UI components (used in dialogs, selects,
// tooltips) call it on mount. Polyfill globally so component tests don't crash;
// harmless in the node environment where nothing constructs it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const QUIET_PATTERNS = [
  /^\[github-auth\]/,
  /^\[memory\]/,
  /^\[app-store\]/,
  /^\[dev-server\]/,
  /^\[review-executor\]/,
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
