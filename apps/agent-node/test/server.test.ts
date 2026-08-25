import { describe, expect, test } from "bun:test";
import { CONTROL_OPERATION_NAMES, SERO_EXTENSION_URI } from "@sero-ai/a2a";
import { BlobStore, INLINE_ARTIFACT_LIMIT } from "../src/blobs.ts";
import { ControllerStore } from "../src/controllers.ts";
import { EventHub } from "../src/events.ts";
import { SessionStore } from "../src/sessions.ts";
import { route } from "../src/server.ts";
import { ensureState, identityFingerprint } from "../src/state.ts";
import { DeferredRunner, runnerFactory, temporaryState } from "./helpers.ts";

async function fixture() {
  const temp = await temporaryState(); const paths = await ensureState(temp.root); const controllers = new ControllerStore(paths);
  const { code } = await controllers.mintCode(); const enrolled = await controllers.enrol(code, "profile");
  const events = new EventHub(); const runners = new Map<string, DeferredRunner>();
  const sessions = new SessionStore(paths, events, runnerFactory(runners));
  const providers = { providers: async () => [], models: async () => [], login: async () => ({ started: true as const }), logout: async () => {}, setApiKey: async () => {}, removeApiKey: async () => {}, respond: () => {}, cancel: () => {} };
  const services = { paths, controllers, sessions, providers, events, blobs: new BlobStore(paths, "https://node"), fingerprint: await identityFingerprint(paths), providersAdvertised: ["anthropic"] };
  const headers = { authorization: `Bearer ${enrolled.token}`, "Sero-Control-Version": "1", "A2A-Version": "1.0", "content-type": "application/json" };
  return { temp, services, headers, runners };
}

describe("wire contracts", () => {
  test("declares exactly 18 control operations and the limited tool surface", async () => {
    expect(CONTROL_OPERATION_NAMES).toHaveLength(18);
    const current = await fixture();
    try {
      const response = await route(new Request("https://node/.well-known/agent-card.json"), current.services, "https://node");
      const card = await response.json();
      expect(JSON.stringify(card)).toContain(SERO_EXTENSION_URI);
      expect(JSON.stringify(card)).not.toContain("bedrock");
      expect(JSON.stringify(card)).not.toContain("browser");
    } finally { await current.temp.cleanup(); }
  });

  test("keeps the card public and all node state bearer-authenticated", async () => {
    const current = await fixture();
    try {
      const publicCard = await route(new Request("https://node/.well-known/agent-card.json"), current.services, "https://node");
      expect(publicCard.status).toBe(200);
      const denied = await route(new Request("https://node/sero/v1/listSessions", { method: "POST", headers: { "Sero-Control-Version": "1" }, body: "{}" }), current.services, "https://node");
      expect(denied.status).toBe(401);
      expect(await denied.json()).toEqual({ error: { code: "unauthorized", message: "Unauthorized" } });
    } finally { await current.temp.cleanup(); }
  });

  test("refuses control and A2A version skew independently", async () => {
    const current = await fixture();
    try {
      const control = await route(new Request("https://node/sero/v1/listSessions", { method: "POST", headers: { authorization: current.headers.authorization }, body: "{}" }), current.services, "https://node");
      expect(await control.json()).toMatchObject({ error: { code: "version_mismatch" } });
      const a2a = await route(new Request("https://node/", { method: "POST", headers: { authorization: current.headers.authorization, "A2A-Version": "0.3" }, body: "{}" }), current.services, "https://node");
      expect(await a2a.json()).toMatchObject({ error: { code: -32009 } });
      const healthy = await route(new Request("https://node/sero/v1/getNodeHealth", { method: "POST", headers: current.headers, body: "{}" }), current.services, "https://node");
      expect(healthy.status).toBe(200);
    } finally { await current.temp.cleanup(); }
  });

  test("implements the five required A2A task operations", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "a2a" });
      const call = (method: string, params: object) => route(new Request("https://node/", { method: "POST", headers: current.headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), current.services, "https://node");
      const stream = await call("SendStreamingMessage", { message: { contextId: session.id, parts: [{ text: "run" }] } });
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      const task = current.services.sessions.activeTask(session.id)!;
      expect((await call("GetTask", { id: task.taskId })).status).toBe(200);
      expect((await call("SubscribeToTask", { id: task.taskId })).headers.get("content-type")).toContain("text/event-stream");
      const joined = await call("SendStreamingMessage", { message: { contextId: session.id, parts: [{ text: "follow up" }] } });
      expect(joined.status).toBe(200);
      const canceled = await call("CancelTask", { id: task.taskId });
      expect(JSON.stringify(await canceled.json())).toContain("TASK_STATE_CANCELED");
      const other = await current.services.sessions.create({ model: "test/model", workspace: "send" });
      setTimeout(() => current.runners.get(other.id)?.release?.("done"), 10);
      const sent = await call("SendMessage", { message: { contextId: other.id, parts: [{ text: "hello" }] } });
      expect(JSON.stringify(await sent.json())).toContain("TASK_STATE_COMPLETED");
    } finally { await current.temp.cleanup(); }
  });

  test("refuses absent and unknown contexts with the same A2A error", async () => {
    const current = await fixture();
    try {
      const call = (message: object) => route(new Request("https://node/", { method: "POST", headers: current.headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: { message } }) }), current.services, "https://node");
      const absent = await (await call({ parts: [{ text: "x" }] })).json();
      const unknown = await (await call({ contextId: crypto.randomUUID(), parts: [{ text: "x" }] })).json();
      expect(absent).toEqual(unknown);
    } finally { await current.temp.cleanup(); }
  });

  test("uses inline artifacts below 1 MB and authenticated URLs at the boundary", async () => {
    const current = await fixture();
    try {
      const small = await current.services.blobs.artifact("session", new Uint8Array(INLINE_ARTIFACT_LIMIT - 1), "application/octet-stream", "small");
      const large = await current.services.blobs.artifact("session", new Uint8Array(INLINE_ARTIFACT_LIMIT), "application/octet-stream", "large");
      expect(JSON.stringify(small)).toContain("raw"); expect(JSON.stringify(large)).toContain("https://node/sero/v1/blob/");
      expect(JSON.stringify(large)).not.toContain("token");
    } finally { await current.temp.cleanup(); }
  });
});
