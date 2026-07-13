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
