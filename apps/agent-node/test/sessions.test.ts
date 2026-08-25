import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { EventHub } from "../src/events.ts";
import { SessionStore } from "../src/sessions.ts";
import { ensureState } from "../src/state.ts";
import { DeferredRunner, runnerFactory, temporaryState } from "./helpers.ts";

describe("persistent sessions and tasks", () => {
  test("refuses absent and unknown contexts", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root); const store = new SessionStore(paths, new EventHub(), runnerFactory(new Map()));
      await expect(store.send(undefined, "hello", "controller")).rejects.toThrow("session_not_found");
      await expect(store.send(crypto.randomUUID(), "hello", "controller")).rejects.toThrow("session_not_found");
    } finally { await temp.cleanup(); }
  });

  test("joins a second mid-turn message to the same task", async () => {
    const temp = await temporaryState(); const runners = new Map<string, DeferredRunner>();
    try {
      const paths = await ensureState(temp.root); const store = new SessionStore(paths, new EventHub(), runnerFactory(runners));
      const session = await store.create({ model: "test/model", workspace: "one" });
      const first = await store.send(session.id, "first", "controller");
      const second = await store.send(session.id, "second", "controller");
      expect(second.taskId).toBe(first.taskId);
      expect(runners.get(session.id)?.calls).toEqual(["first", "second"]);
      expect(runners.get(session.id)?.behaviors).toEqual(["followUp", "followUp"]);
      runners.get(session.id)?.release?.("done");
      let task = await store.getTask(first.taskId);
      for (let attempt = 0; task?.status !== "completed" && attempt < 100; attempt++) {
        await Bun.sleep(5);
        task = await store.getTask(first.taskId);
      }
      expect(task?.status).toBe("completed");
    } finally { await temp.cleanup(); }
  });

  test("admits only one turn when sends arrive while the runner starts", async () => {
    const temp = await temporaryState(); const runners = new Map<string, DeferredRunner>();
    try {
      const paths = await ensureState(temp.root);
      let start: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => { start = resolve; });
      let factoryCalls = 0;
      const factory = runnerFactory(runners);
      const store = new SessionStore(paths, new EventHub(), async (...args) => {
        factoryCalls++;
        await gate;
        return factory(...args);
      });
      const session = await store.create({ model: "test/model", workspace: "atomic" });
      const firstPromise = store.send(session.id, "first", "controller");
      const secondPromise = store.send(session.id, "second", "controller", "steer");
      start?.();
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      expect(second.taskId).toBe(first.taskId);
      expect(factoryCalls).toBe(1);
      expect(runners.get(session.id)?.calls.toSorted()).toEqual(["first", "second"]);
      runners.get(session.id)?.release?.("done");
    } finally { await temp.cleanup(); }
  });

  test("records runner startup failures as durable failed tasks with the model name", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root);
      const store = new SessionStore(paths, new EventHub(), async () => { throw new Error("injected startup failure"); });
      const session = await store.create({ model: "missing/special-model", workspace: "failure" });
      const task = await store.send(session.id, "hello", "controller");
      expect(task).toMatchObject({ status: "failed" });
      expect(task.message).toContain("missing/special-model");
      expect(await store.getTask(task.taskId)).toMatchObject({ status: "failed", message: task.message });
      expect(await readFile(`${paths.tasks}/${session.id}.jsonl`, "utf8")).toContain("missing/special-model");
    } finally { await temp.cleanup(); }
  });

  test("replays committed entries after a cursor and then reports a partial", async () => {
    const temp = await temporaryState(); const runners = new Map<string, DeferredRunner>();
    try {
      const paths = await ensureState(temp.root); const store = new SessionStore(paths, new EventHub(), runnerFactory(runners));
      const session = await store.create({ model: "test/model", workspace: "replay" });
      await store.send(session.id, "hello", "controller");
      while (!runners.get(session.id)?.release) await Bun.sleep(1);
      runners.get(session.id)?.release?.("answer"); await Bun.sleep(10);
      const all = await store.replay(session.id); expect(all.events).toHaveLength(2);
      expect(all.events.every((entry) => /^[0-9a-f]{8}$/.test(entry.id))).toBe(true);
      expect(all.events[1].parentId).toBe(all.events[0].id);
      expect((await store.replay(session.id, all.events[0].id)).events.map((entry) => entry.id)).toEqual([all.events[1].id]);
      expect((await store.replay(session.id, "ffffffff")).resync).toBe(true);
    } finally { await temp.cleanup(); }
  });

  test("reopens the authoritative Pi history for a later turn after restart", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root); const firstRunners = new Map<string, DeferredRunner>();
      const firstStore = new SessionStore(paths, new EventHub(), runnerFactory(firstRunners));
      const session = await firstStore.create({ model: "test/model", workspace: "history" });
      const firstTask = await firstStore.send(session.id, "first", "controller");
      firstRunners.get(session.id)?.release?.("one");
      while ((await firstStore.getTask(firstTask.taskId))?.status !== "completed") await Bun.sleep(1);
      const persisted = await firstStore.required(session.id);
      expect(persisted.piSessionPath).toBeTruthy();

      const secondRunners = new Map<string, DeferredRunner>();
      const restarted = new SessionStore(paths, new EventHub(), runnerFactory(secondRunners));
      const secondTask = await restarted.send(session.id, "second", "controller");
      expect(secondRunners.get(session.id)?.sessionPath).toBe(persisted.piSessionPath);
      secondRunners.get(session.id)?.release?.("two");
      while ((await restarted.getTask(secondTask.taskId))?.status !== "completed") await Bun.sleep(1);
      const replay = await restarted.replay(session.id);
      expect(replay.events).toHaveLength(4);
      expect(replay.events.map((entry) => entry.parentId)).toEqual([
        null, replay.events[0].id, replay.events[1].id, replay.events[2].id,
      ]);
    } finally { await temp.cleanup(); }
  });

  test("deletes the authoritative Pi session file", async () => {
    const temp = await temporaryState(); const runners = new Map<string, DeferredRunner>();
    try {
      const paths = await ensureState(temp.root); const store = new SessionStore(paths, new EventHub(), runnerFactory(runners));
      const session = await store.create({ model: "test/model", workspace: "delete" });
      const task = await store.send(session.id, "hello", "controller");
      runners.get(session.id)?.release?.("done");
      while ((await store.getTask(task.taskId))?.status !== "completed") await Bun.sleep(1);
      const piSessionPath = (await store.required(session.id)).piSessionPath;
      expect(piSessionPath).toBeTruthy();
      await store.delete(session.id);
      await expect(access(piSessionPath!)).rejects.toThrow();
      expect(await store.get(session.id)).toBeUndefined();
    } finally { await temp.cleanup(); }
  });

  test("marks non-terminal tasks failed on startup recovery", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root); const runners = new Map<string, DeferredRunner>();
      const store = new SessionStore(paths, new EventHub(), runnerFactory(runners));
      const session = await store.create({ model: "test/model", workspace: "restart" });
      const task = await store.send(session.id, "work", "controller");
      const restarted = new SessionStore(paths, new EventHub(), runnerFactory(new Map()));
      expect(await restarted.recover()).toBe(1);
      expect(await restarted.getTask(task.taskId)).toMatchObject({ status: "failed", message: "the node restarted" });
      expect(await readFile(`${paths.tasks}/${session.id}.jsonl`, "utf8")).toContain("the node restarted");
      runners.get(session.id)?.release?.("");
    } finally { await temp.cleanup(); }
  });
});
