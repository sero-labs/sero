import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
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
      runners.get(session.id)?.release?.("done");
      await Bun.sleep(10);
      expect((await store.getTask(first.taskId))?.status).toBe("completed");
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
      expect((await store.replay(session.id, all.events[0].id)).events.map((entry) => entry.role)).toEqual(["assistant"]);
      expect((await store.replay(session.id, "ffffffff")).resync).toBe(true);
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
