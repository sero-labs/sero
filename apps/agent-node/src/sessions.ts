import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { StatePaths } from "./state.ts";
import { confinedWorkspace, secureWrite } from "./state.ts";
import type { SessionRunner, SessionRunnerFactory } from "./pi-host.ts";
import type { SessionEntry, SessionRecord, TaskStatus, TaskTransition } from "./types.ts";
import { EventHub } from "./events.ts";
import { safeMessage } from "./redact.ts";

const TERMINAL = new Set<TaskStatus>(["completed", "failed", "canceled", "rejected"]);
interface ActiveTurn { task: TaskTransition; runner: SessionRunner; partial: string; promise: Promise<void> }

export class SessionStore {
  readonly #active = new Map<string, ActiveTurn>();
  constructor(readonly paths: StatePaths, readonly events: EventHub, readonly runnerFactory: SessionRunnerFactory) {}

  async create(input: { name?: string; model: string; workspace: string }): Promise<SessionRecord> {
    const id = randomUUID();
    const workspace = await confinedWorkspace(this.paths, input.workspace);
    const now = new Date().toISOString();
    const record = { id, name: input.name?.trim() || id.slice(0, 8), model: input.model, workspace, createdAt: now, updatedAt: now };
    await secureWrite(this.#sessionPath(id), `${JSON.stringify(record)}\n`);
    await secureWrite(this.#entryPath(id), "");
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
    await Promise.all([
      rm(this.#sessionPath(id), { force: true }), rm(this.#entryPath(id), { force: true }),
      rm(this.#taskPath(id), { force: true }), rm(join(this.paths.blobs, id), { force: true, recursive: true }),
    ]);
  }

  async send(contextId: string | undefined, text: string, controllerId: string, behavior: "followUp" | "steer" = "followUp"): Promise<TaskTransition> {
    if (!contextId) throw new Error("session_not_found");
    const record = await this.required(contextId);
    const active = this.#active.get(contextId);
    if (active) {
      await active.runner.run(text, behavior, (delta) => this.#delta(contextId, active, delta));
      return active.task;
    }
    const first = await this.#appendEntry(contextId, { type: "message", role: "user", text });
    const task: TaskTransition = { taskId: randomUUID(), contextId, status: "submitted", controllerId, firstEntryId: first.id, lastEntryId: first.id, updatedAt: new Date().toISOString() };
    await this.#transition(task, "submitted");
    const runner = await this.runnerFactory(contextId, record.workspace, record.model);
    const turn: ActiveTurn = { task, runner, partial: "", promise: Promise.resolve() };
    this.#active.set(contextId, turn);
    turn.promise = this.#execute(record, turn, text);
    return task;
  }

  async #execute(record: SessionRecord, turn: ActiveTurn, text: string): Promise<void> {
    await this.#transition(turn.task, "working");
    try {
      const answer = await turn.runner.run(text, "followUp", (delta) => this.#delta(record.id, turn, delta));
      if (turn.task.status === "canceled") return;
      const entry = await this.#appendEntry(record.id, { type: "message", role: "assistant", text: answer || turn.partial });
      turn.task.lastEntryId = entry.id;
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

  async cancel(taskId: string): Promise<TaskTransition> {
    const active = [...this.#active.values()].find((item) => item.task.taskId === taskId);
    if (!active) throw new Error("task_not_found");
    await this.#transition(active.task, "canceled");
    await active.runner.cancel();
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
    const entries = await this.#readLines<SessionEntry>(this.#entryPath(contextId));
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

  async #appendEntry(contextId: string, entry: Omit<SessionEntry, "id" | "parentId" | "createdAt">): Promise<SessionEntry> {
    const entries = await this.#readLines<SessionEntry>(this.#entryPath(contextId));
    const value = { ...entry, id: randomBytes(4).toString("hex"), parentId: entries.at(-1)?.id ?? null, createdAt: new Date().toISOString() };
    await appendFile(this.#entryPath(contextId), `${JSON.stringify(value)}\n`, { mode: 0o600 });
    this.events.emit(`session:${contextId}`, { type: "entry", data: value });
    return value;
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
  #entryPath(id: string): string { return join(this.paths.sessions, `${id}.jsonl`); }
  #taskPath(id: string): string { return join(this.paths.tasks, `${id}.jsonl`); }
}
