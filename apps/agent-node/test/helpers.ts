import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionRunner, SessionRunnerFactory } from "../src/pi-host.ts";

export async function temporaryState(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "sero-node-test-"));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export class DeferredRunner implements SessionRunner {
  calls: string[] = [];
  canceled = false;
  release?: (value: string) => void;
  run(text: string, _behavior: "followUp" | "steer", onDelta: (text: string) => void): Promise<string> {
    this.calls.push(text);
    if (this.calls.length > 1) return Promise.resolve("");
    return new Promise((resolve) => { this.release = (value) => { onDelta(value); resolve(value); }; });
  }
  async cancel(): Promise<void> { this.canceled = true; this.release?.(""); }
}

export function runnerFactory(runners: Map<string, DeferredRunner>): SessionRunnerFactory {
  return async (id) => { const runner = new DeferredRunner(); runners.set(id, runner); return runner; };
}
