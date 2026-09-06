/**
 * Holds every wake until restart reconciliation has finished. A wake asked for
 * before the gate opens waits; it is never dropped and never delivered early.
 */
export interface WakeGate {
  readonly open: boolean;
  release(): void;
  whenOpen(): Promise<void>;
}

export function createWakeGate(): WakeGate {
  let open = false;
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  return {
    get open() { return open; },
    release() { open = true; release(); },
    whenOpen() { return opened; },
  };
}
