import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionRunner, SessionRunnerFactory } from "../src/pi-host.ts";
import type { SessionEntry } from "../src/types.ts";

export async function temporaryState(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "sero-node-test-"));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export class DeferredRunner implements SessionRunner {
  calls: string[] = [];
  behaviors: Array<"followUp" | "steer"> = [];
  canceled = false;
  release?: (value: string) => void;
  readonly sessionPath: string;
  readonly #entries: SessionEntry[];

  constructor(sessionPath: string) {
    this.sessionPath = sessionPath;
    if (existsSync(this.sessionPath)) {
      this.#entries = readFileSync(this.sessionPath, "utf8").split("\n").filter(Boolean).slice(1)
        .map((line) => JSON.parse(line) as SessionEntry);
    } else {
      this.#entries = [];
      writeFileSync(this.sessionPath, `${JSON.stringify({ type: "session", version: 3, id: "test", timestamp: new Date().toISOString(), cwd: "test" })}\n`);
    }
  }

  run(text: string, behavior: "followUp" | "steer", onDelta: (text: string) => void): Promise<string> {
    this.calls.push(text);
    this.behaviors.push(behavior);
    this.#append("user", text);
    if (this.calls.length > 1) return Promise.resolve("");
    return new Promise((resolve) => {
      this.release = (value) => {
        onDelta(value);
        this.#append("assistant", value);
        resolve(value);
      };
    });
  }
  async cancel(): Promise<void> { this.canceled = true; this.release?.(""); }
  entries(): SessionEntry[] { return [...this.#entries]; }

  #append(role: string, text: string): void {
    const entry: SessionEntry = {
      type: "custom",
      customType: "test-message",
      data: { role, text },
      id: randomBytes(4).toString("hex"),
      parentId: this.#entries.at(-1)?.id ?? null,
      timestamp: new Date().toISOString(),
    };
    this.#entries.push(entry);
    appendFileSync(this.sessionPath, `${JSON.stringify(entry)}\n`);
  }
}

export function runnerFactory(runners: Map<string, DeferredRunner>): SessionRunnerFactory {
  return async (id, cwd, _model, sessionPath) => {
    const runner = new DeferredRunner(sessionPath ?? join(cwd, `.pi-${id}.jsonl`));
    runners.set(id, runner);
    return runner;
  };
}
