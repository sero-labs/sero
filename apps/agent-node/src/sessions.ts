import { appendFile, readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseSessionEntries } from "@earendil-works/pi-coding-agent";
import type { StatePaths } from "./state.ts";
import { confinedWorkspace, secureWrite } from "./state.ts";
import type { SessionRunner, SessionRunnerFactory } from "./pi-host.ts";
import type { SessionEntry, SessionRecord, TaskStatus, TaskTransition } from "./types.ts";
import { EventHub } from "./events.ts";
import { safeMessage } from "./redact.ts";

const TERMINAL = new Set<TaskStatus>(["completed", "failed", "canceled", "rejected"]);
interface QueuedMessage { text: string; behavior: "followUp" | "steer" }
interface ActiveTurn {
  task: TaskTransition;
  runner?: SessionRunner;
  partial: string;
  promise: Promise<void>;
  queued: QueuedMessage[];
  publishedEntryIds: Set<string>;
}

export class SessionStore {
  readonly #active = new Map<string, ActiveTurn>();
  constructor(readonly paths: StatePaths, readonly events: EventHub, readonly runnerFactory: SessionRunnerFactory) {}

  async create(input: { name?: string; model: string; workspace: string }): Promise<SessionRecord> {
    const id = randomUUID();
    const workspace = await confinedWorkspace(this.paths, input.workspace);
    const now = new Date().toISOString();
    const record = { id, name: input.name?.trim() || id.slice(0, 8), model: input.model, workspace, createdAt: now, updatedAt: now };
    await secureWrite(this.#sessionPath(id), `${JSON.stringify(record)}\n`);
    return record;
  }

  async list(): Promise<SessionRecord[]> {
    const names = await readdir(this.paths.sessions);
    const records = await Promise.all(names.filter((name) => name.endsWith(".json") && !name.endsWith(".jsonl")).map((name) => this.get(basename(name, ".json"))));
    return records.filter((item): item is SessionRecord => item !== undefined).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    const file = Bun.file(this.#sessionPath(id));
    if (!(await file.exists())) return undefined;
    return file.json() as Promise<SessionRecord>;
  }

  async setModel(id: string, model: string): Promise<SessionRecord> {
    const record = await this.required(id);
    record.model = model;
    record.updatedAt = new Date().toISOString();
    await secureWrite(this.#sessionPath(id), `${JSON.stringify(record)}\n`);
    return record;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.get(id))) throw new Error("session_not_found");
    await this.cancelByContext(id);
    const record = await this.required(id);
    await Promise.all([
      rm(this.#sessionPath(id), { force: true }),
      ...(record.piSessionPath ? [rm(record.piSessionPath, { force: true })] : []),
      rm(this.#taskPath(id), { force: true }), rm(join(this.paths.blobs, id), { force: true, recursive: true }),
    ]);
  }

  async send(contextId: string | undefined, text: string, controllerId: string, behavior: "followUp" | "steer" = "followUp"): Promise<TaskTransition> {
    if (!contextId) throw new Error("session_not_found");
    const record = await this.required(contextId);
    const active = this.#active.get(contextId);
    if (active) {
      this.#join(contextId, active, { text, behavior });
      return active.task;
    }
    const task: TaskTransition = { taskId: randomUUID(), contextId, status: "submitted", controllerId, updatedAt: new Date().toISOString() };
    const turn: ActiveTurn = {
      task, partial: "", promise: Promise.resolve(), queued: [], publishedEntryIds: new Set(),
    };
    this.#active.set(contextId, turn);
    try {
      await this.#transition(task, "submitted");
      const runner = await this.runnerFactory(contextId, record.workspace, record.model, record.piSessionPath);
      turn.runner = runner;
      turn.publishedEntryIds = new Set(runner.entries().map((entry) => entry.id));
      if (record.piSessionPath !== runner.sessionPath) {
        record.piSessionPath = runner.sessionPath;
        record.updatedAt = new Date().toISOString();
        await secureWrite(this.#sessionPath(contextId), `${JSON.stringify(record)}\n`);
      }
      if (TERMINAL.has(task.status)) {
        await runner.cancel();
        this.#active.delete(contextId);
        return task;
      }
      turn.promise = this.#execute(record, turn, text);
      for (const queued of turn.queued.splice(0)) this.#join(contextId, turn, queued);
    } catch (error) {
      const detail = safeMessage(error);
      const message = detail.includes(record.model) ? detail : `${detail}: ${record.model}`;
      await this.#transition(task, "failed", message);
      this.#active.delete(contextId);
    }
    return task;
  }

  #join(contextId: string, turn: ActiveTurn, queued: QueuedMessage): void {
    if (!turn.runner) {
      turn.queued.push(queued);
      return;
    }
    void turn.runner.run(queued.text, queued.behavior, (delta) => this.#delta(contextId, turn, delta))
      .catch((error: unknown) => this.#failQueuedTurn(turn, error));
  }

  async #failQueuedTurn(turn: ActiveTurn, error: unknown): Promise<void> {
    if (TERMINAL.has(turn.task.status)) return;
    await this.#transition(turn.task, "failed", safeMessage(error));
  }

  async #execute(record: SessionRecord, turn: ActiveTurn, text: string): Promise<void> {
    const runner = turn.runner;
    if (!runner) throw new Error("session_runner_unavailable");
    const answerPromise = runner.run(
      text,
      "followUp",
      (delta) => this.#delta(record.id, turn, delta),
    );
    await this.#transition(turn.task, "working");
    try {
      await answerPromise;
      if (TERMINAL.has(turn.task.status)) return;
      this.#publishEntries(record.id, turn);
      await this.#transition(turn.task, "completed");
    } catch (error) {
      if (turn.task.status === "canceled") return;
      const message = safeMessage(error);
      await this.#transition(turn.task, /auth|credential|api key/i.test(message) ? "auth-required" : "failed", message);
    } finally {
      this.#active.delete(record.id);
    }
  }

  #delta(contextId: string, turn: ActiveTurn, delta: string): void {
    turn.partial += delta;
    this.events.emit(`session:${contextId}`, { type: "delta", data: { text: delta } });
  }

  #publishEntries(contextId: string, turn: ActiveTurn): void {
    for (const entry of turn.runner?.entries() ?? []) {
      if (turn.publishedEntryIds.has(entry.id)) continue;
      turn.publishedEntryIds.add(entry.id);
      turn.task.firstEntryId ??= entry.id;
      turn.task.lastEntryId = entry.id;
      this.events.emit(`session:${contextId}`, { type: "entry", data: entry });
    }
  }

  async cancel(taskId: string): Promise<TaskTransition> {
    const active = [...this.#active.values()].find((item) => item.task.taskId === taskId);
    if (!active) throw new Error("task_not_found");
    await this.#transition(active.task, "canceled");
    await active.runner?.cancel();
    await active.promise;
    return active.task;
  }

  async cancelByController(controllerId: string): Promise<void> {
    await Promise.all([...this.#active.values()].filter((item) => item.task.controllerId === controllerId).map((item) => this.cancel(item.task.taskId)));
  }

  async cancelByContext(contextId: string): Promise<void> {
    const active = this.#active.get(contextId);
    if (active) await this.cancel(active.task.taskId);
  }

  async getTask(taskId: string): Promise<TaskTransition | undefined> {
    for (const session of await this.list()) {
      const tasks = await this.#readLines<TaskTransition>(this.#taskPath(session.id));
      const found = tasks.filter((item) => item.taskId === taskId).at(-1);
      if (found) return found;
    }
    return undefined;
  }

  async recover(): Promise<number> {
    let count = 0;
    for (const session of await this.list()) {
      const tasks = await this.#readLines<TaskTransition>(this.#taskPath(session.id));
      const latest = new Map(tasks.map((task) => [task.taskId, task]));
      for (const task of latest.values()) if (!TERMINAL.has(task.status)) { await this.#transition(task, "failed", "the node restarted"); count++; }
    }
    return count;
  }

  async replay(contextId: string, cursor?: string): Promise<{ events: SessionEntry[]; resync: boolean; partial?: string }> {
    await this.required(contextId);
    const record = await this.required(contextId);
    const entries = await this.#sessionEntries(record);
    const index = cursor ? entries.findIndex((entry) => entry.id === cursor) : -1;
    const resync = Boolean(cursor) && index < 0;
    const active = this.#active.get(contextId);
    return { events: entries.slice(resync ? 0 : index + 1), resync, partial: active?.partial || undefined };
  }

  activeTask(contextId: string): TaskTransition | undefined { return this.#active.get(contextId)?.task; }

  async required(id: string): Promise<SessionRecord> {
    const record = await this.get(id);
    if (!record) throw new Error("session_not_found");
    return record;
  }

  async #sessionEntries(record: SessionRecord): Promise<SessionEntry[]> {
    const active = this.#active.get(record.id);
    if (active?.runner) return active.runner.entries();
    if (!record.piSessionPath) return [];
    const text = await readFile(record.piSessionPath, "utf8");
    return parseSessionEntries(text).filter((entry): entry is SessionEntry => entry.type !== "session");
  }

  async #transition(task: TaskTransition, status: TaskStatus, message?: string): Promise<void> {
    task.status = status; task.updatedAt = new Date().toISOString(); task.message = message;
    await appendFile(this.#taskPath(task.contextId), `${JSON.stringify(task)}\n`, { mode: 0o600 });
    this.events.emit(`task:${task.taskId}`, { type: "task", data: { ...task } });
  }

  async #readLines<T>(path: string): Promise<T[]> {
    if (!(await Bun.file(path).exists())) return [];
    const text = await readFile(path, "utf8");
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
  }
  #sessionPath(id: string): string { return join(this.paths.sessions, `${id}.json`); }
  #taskPath(id: string): string { return join(this.paths.tasks, `${id}.jsonl`); }
}
