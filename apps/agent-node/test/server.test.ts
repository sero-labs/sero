import { describe, expect, test } from "bun:test";
import {
  AuthEventSchema,
  CONTROL_OPERATION_NAMES,
  ControlOperationSchemas,
  NodeEventSchema,
  SessionEventSchema,
  SERO_EXTENSION_URI,
  ClientFactory,
  JsonRpcTransportFactory,
  Role,
  TaskState,
  type ControlOperationName,
  type ThinkingLevel,
} from "@sero-ai/a2a";
import { BlobStore, INLINE_ARTIFACT_LIMIT } from "../src/blobs.ts";
import { ControllerStore } from "../src/controllers.ts";
import { EventHub } from "../src/events.ts";
import { SessionStore } from "../src/sessions.ts";
import { route } from "../src/server.ts";
import { ensureState, identityFingerprint } from "../src/state.ts";
import type { TaskTransition } from "../src/types.ts";
import { DeferredRunner, runnerFactory, temporaryState } from "./helpers.ts";

async function fixture() {
  const temp = await temporaryState();
  const paths = await ensureState(temp.root);
  const controllers = new ControllerStore(paths);
  const { code } = await controllers.mintCode();
  const enrolled = await controllers.enrol(code, "Desktop");
  const events = new EventHub();
  const runners = new Map<string, DeferredRunner>();
  const blobs = new BlobStore(paths, "https://node");
  const sessions = new SessionStore(paths, events, runnerFactory(runners), blobs);
  const disconnected: string[] = [];
  const providers = {
    providers: async () => ({
      oauth: [{ id: "anthropic", name: "Anthropic", isLoggedIn: false }],
      apiKey: [{ id: "anthropic", name: "Anthropic", hasKey: false, fromEnv: false }],
    }),
    models: async () => [{
      provider: "anthropic", id: "claude", name: "Claude", reasoning: true,
      availableThinkingLevels: ["off", "low", "medium", "high"] as ThinkingLevel[],
    }],
    login: async () => ({ ok: true as const }), logout: async () => {}, setApiKey: async () => {},
    removeApiKey: async () => {}, respond: () => {}, cancel: () => {},
    disconnect: (id: string) => { disconnected.push(id); },
  };
  const services = { paths, controllers, sessions, providers, events, blobs, fingerprint: await identityFingerprint(paths), providersAdvertised: ["anthropic"] };
  const headers = { authorization: `Bearer ${enrolled.token}`, "Sero-Control-Version": "1", "A2A-Version": "1.0", "content-type": "application/json" };
  return { temp, services, headers, runners, enrolled, disconnected };
}

function post(current: Awaited<ReturnType<typeof fixture>>, operation: string, body: object, headers: HeadersInit = current.headers): Promise<Response> {
  return route(new Request(`https://node/sero/v1/${operation}`, { method: "POST", headers, body: JSON.stringify(body) }), current.services, "https://node");
}

function rpc(current: Awaited<ReturnType<typeof fixture>>, method: string, params: object, allowIdle?: () => void): Promise<Response> {
  return route(new Request("https://node/", { method: "POST", headers: current.headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), current.services, "https://node", allowIdle);
}

function delayedRequest(url: string, headers: HeadersInit, value: object) {
  let release = () => {};
  let markRead = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const read = new Promise<void>((resolve) => { markRead = resolve; });
  class DelayedRequest extends Request {
    override async json(): Promise<unknown> {
      markRead();
      await gate;
      return value;
    }
  }
  return { request: new DelayedRequest(url, { method: "POST", headers }), read, release };
}

async function sseMessages(response: Response, count: number): Promise<Array<{ event: string; id?: string; data: unknown }>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (text.split("\n\n").filter(Boolean).length < count) text += decoder.decode((await reader.read()).value);
  await reader.cancel();
  return text.split("\n\n").filter(Boolean).slice(0, count).map((block) => {
    const lines = block.split("\n");
    return { event: lines.find((line) => line.startsWith("event: "))!.slice(7), id: lines.find((line) => line.startsWith("id: "))?.slice(4), data: JSON.parse(lines.find((line) => line.startsWith("data: "))!.slice(6)) as unknown };
  });
}

describe("wire contracts", () => {
  test("declares the control operations and the limited tool surface", async () => {
    expect(CONTROL_OPERATION_NAMES).toHaveLength(20);
    const current = await fixture();
    try {
      const response = await route(new Request("https://node/.well-known/agent-card.json"), current.services, "https://node");
      const card = await response.json();
      expect(JSON.stringify(card)).toContain(SERO_EXTENSION_URI);
      expect(JSON.stringify(card)).not.toContain("bedrock");
      expect(JSON.stringify(card)).not.toContain("browser");
    } finally { await current.temp.cleanup(); }
  });

  test("serves requests and replies accepted by every shared operation schema", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "anthropic/claude", workspace: "contract" });
      const { code } = await current.services.controllers.mintCode();
      const inputs: Record<ControlOperationName, object> = {
        enrol: { code, controllerName: "Second Desktop" }, mintEnrolmentCode: {}, listControllers: {},
        revokeController: { controllerId: current.enrolled.controllerId }, listSessions: {},
    createSession: { workspace: "created", model: { providerId: "anthropic", modelId: "claude" }, thinkingLevel: "high", name: "Created" },
        deleteSession: { contextId: session.id }, setSessionModel: { contextId: session.id, model: { providerId: "anthropic", modelId: "opus" } },
    setSessionThinkingLevel: { contextId: session.id, thinkingLevel: "medium" },
    setSessionApprovalMode: { contextId: session.id, approvalMode: "allow" },
        getNodeHealth: {}, getProviders: {}, login: { providerId: "anthropic" }, logout: { providerId: "anthropic" },
        setApiKey: { providerId: "anthropic", key: "secret" }, removeApiKey: { providerId: "anthropic" },
        respondPrompt: { value: "yes" }, respondSelect: { value: "one" }, respondManualCode: { value: "code" }, cancel: {},
      };
      const order: ControlOperationName[] = [...CONTROL_OPERATION_NAMES.filter((name) => name !== "deleteSession" && name !== "revokeController"), "deleteSession", "revokeController"];
      for (const name of order) {
        expect(ControlOperationSchemas[name].request.safeParse(inputs[name]).success).toBe(true);
        const response = await post(current, name, inputs[name], name === "enrol" ? { "Sero-Control-Version": "1", "content-type": "application/json" } : current.headers);
        expect(response.status, name).toBe(200);
        expect(ControlOperationSchemas[name].response.safeParse(await response.json()).success, name).toBe(true);
      }
    } finally { await current.temp.cleanup(); }
  });

  test("keeps the card public and refuses version skew", async () => {
    const current = await fixture();
    try {
      expect((await route(new Request("https://node/.well-known/agent-card.json"), current.services, "https://node")).status).toBe(200);
      expect((await post(current, "listSessions", {}, { "Sero-Control-Version": "1", "content-type": "application/json" })).status).toBe(401);
      expect(await (await post(current, "listSessions", {}, { authorization: current.headers.authorization, "content-type": "application/json" })).json()).toMatchObject({ error: { code: "version_mismatch" } });
      expect(await (await route(new Request("https://node/", { method: "POST", headers: { authorization: current.headers.authorization, "A2A-Version": "0.3" }, body: "{}" }), current.services, "https://node")).json()).toMatchObject({ error: { code: -32009 } });
    } finally { await current.temp.cleanup(); }
  });

  test("implements the canonical five A2A operations and rejects legacy names", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "a2a" });
      const stream = await rpc(current, "SendStreamingMessage", { message: { contextId: session.id, parts: [{ text: "run" }] } });
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      const task = current.services.sessions.activeTask(session.id)!;
      expect((await rpc(current, "GetTask", { id: task.taskId })).status).toBe(200);
      expect((await rpc(current, "SubscribeToTask", { id: task.taskId })).headers.get("content-type")).toContain("text/event-stream");
      await rpc(current, "SendStreamingMessage", { message: { contextId: session.id, metadata: { "sero:queue-mode": "steer" }, parts: [{ text: "steer" }] } });
      expect(current.runners.get(session.id)?.calls).toEqual(["run", "steer"]);
      expect(JSON.stringify(await (await rpc(current, "CancelTask", { id: task.taskId })).json())).toContain("TASK_STATE_CANCELED");
      const other = await current.services.sessions.create({ model: "test/model", workspace: "send" });
      setTimeout(() => current.runners.get(other.id)?.release?.("done"), 10);
      expect(JSON.stringify(await (await rpc(current, "SendMessage", { message: { contextId: other.id, parts: [{ text: "hello" }] } })).json())).toContain("TASK_STATE_COMPLETED");
      for (const legacy of ["message/send", "message/stream", "tasks/get", "tasks/cancel", "tasks/resubscribe"]) {
        expect(await (await rpc(current, legacy, {})).json(), legacy).toMatchObject({ error: { message: "MethodNotFound" } });
      }
    } finally { await current.temp.cleanup(); }
  });

  test("waits for non-streaming tasks through task events without reading task logs", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "event-wait" });
      let taskReads = 0;
      let idleAllowed = false;
      const getTask = current.services.sessions.getTask.bind(current.services.sessions);
      current.services.sessions.getTask = async (taskId) => { taskReads += 1; return getTask(taskId); };
      setTimeout(() => current.runners.get(session.id)?.release?.("done"), 10);

      const response = await rpc(current, "SendMessage", { message: { contextId: session.id, parts: [{ text: "hello" }] } }, () => { idleAllowed = true; });

      expect(JSON.stringify(await response.json())).toContain("TASK_STATE_COMPLETED");
      expect(taskReads).toBe(0);
      expect(idleAllowed).toBe(true);
    } finally { await current.temp.cleanup(); }
  });

  test("separates invalid enrolment codes from internal control failures", async () => {
    const current = await fixture();
    try {
      const enrol = await post(current, "enrol", { code: "expired", controllerName: "Desktop" }, {
        "Sero-Control-Version": "1", "content-type": "application/json",
      });
      expect(enrol.status).toBe(401);
      expect(await enrol.json()).toMatchObject({ error: { code: "unauthorized", message: "Invalid or expired enrolment code" } });

      const invalid = await post(current, "listControllers", { unexpected: true });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ error: { code: "invalid_request" } });

      current.services.controllers.list = async () => { throw new Error("disk failed"); };
      const internal = await post(current, "listControllers", {});
      expect(internal.status).toBe(500);
      expect(await internal.json()).toMatchObject({ error: { code: "internal_error", message: "Internal error" } });
    } finally { await current.temp.cleanup(); }
  });

  test("passes all five operations through the canonical SDK ClientFactory", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "sdk" });
      const sdkFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        headers.set("authorization", current.headers.authorization);
        headers.set("A2A-Version", "1.0");
        const url = input instanceof Request ? input.url : input.toString();
        return route(new Request(url, { ...init, headers }), current.services, "https://node");
      };
      const fetchImpl: typeof fetch = Object.assign(sdkFetch, { preconnect: fetch.preconnect });
      const card = await (await route(new Request("https://node/.well-known/agent-card.json"), current.services, "https://node")).json();
      const client = await new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl })] }).createFromAgentCard(card);
      const request = {
        tenant: "sero",
        message: {
          messageId: crypto.randomUUID(), contextId: session.id, taskId: "", role: Role.ROLE_USER,
          parts: [{ content: { $case: "text" as const, value: "run" }, metadata: undefined, filename: "", mediaType: "text/plain" }],
          metadata: undefined, extensions: [], referenceTaskIds: [],
        },
        configuration: undefined,
        metadata: undefined,
      };
      const stream = client.sendMessageStream(request);
      const first = await stream.next();
      const firstPayload = first.value?.payload;
      expect(firstPayload?.$case).toBe("task");
      if (!firstPayload || firstPayload.$case !== "task") throw new Error("SDK did not receive a task stream payload");
      const taskId = firstPayload.value.id;
      expect((await client.getTask({ tenant: "sero", id: taskId })).id).toBe(taskId);
      const subscription = client.resubscribeTask({ tenant: "sero", id: taskId });
      expect((await subscription.next()).value?.payload?.$case).toBe("task");
      expect((await client.cancelTask({ tenant: "sero", id: taskId, metadata: undefined })).status?.state).toBe(TaskState.TASK_STATE_CANCELED);
      const other = await current.services.sessions.create({ model: "test/model", workspace: "sdk-send" });
      setTimeout(() => current.runners.get(other.id)?.release?.("done"), 10);
      const sent = await client.sendMessage({ ...request, message: { ...request.message, messageId: crypto.randomUUID(), contextId: other.id } });
      expect("status" in sent && sent.status?.state).toBe(3);
      await stream.return();
      await subscription.return();
    } finally { await current.temp.cleanup(); }
  });

  test("rejects traversal and malformed filesystem-facing identifiers", async () => {
    const current = await fixture();
    try {
      expect((await post(current, "createSession", { workspace: "../outside", model: { providerId: "a", modelId: "b" } })).status).toBe(400);
      expect((await post(current, "deleteSession", { contextId: "../../clients" })).status).toBe(400);
      expect((await route(new Request("https://node/sero/v1/blob/not-a-uuid", { headers: current.headers }), current.services, "https://node")).status).toBe(400);
    } finally { await current.temp.cleanup(); }
  });

  test("emits schema-valid replay in entry, snapshot, live order with entry ids", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "replay" });
      await current.services.sessions.send(session.id, "hello", current.enrolled.controllerId);
      current.runners.get(session.id)?.emit?.("partial");
      const replay = current.services.sessions.replay.bind(current.services.sessions);
      current.services.sessions.replay = async (contextId, cursor) => {
        const result = await replay(contextId, cursor);
        current.runners.get(session.id)?.emit?.("during-snapshot");
        return result;
      };
      const request = new Request(`https://node/sero/v1/sessions/${session.id}/events`, { headers: current.headers });
      const response = await route(request, current.services, "https://node");
      const messages = await sseMessages(response, 4);
      expect(messages.map((item) => item.event)).toEqual(["entry", "snapshot", "synced", "delta"]);
      expect(messages[0].id).toBe((messages[0].data as { entry: { id: string } }).entry.id);
      for (const message of messages) expect(SessionEventSchema.safeParse(message.data).success).toBe(true);
    } finally { await current.temp.cleanup(); }
  });

  test("closes a stream whose initial task is AUTH_REQUIRED", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "auth" });
      const task: TaskTransition = {
        taskId: crypto.randomUUID(), contextId: session.id, status: "auth-required",
        controllerId: current.enrolled.controllerId, updatedAt: new Date().toISOString(),
        message: "Authentication required",
      };
      current.services.sessions.send = async () => task;
      const response = await route(new Request("https://node/", {
        method: "POST", headers: current.headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "SendStreamingMessage", params: { message: {
          role: "ROLE_USER", messageId: crypto.randomUUID(), contextId: session.id, parts: [{ text: "hello" }],
        } } }),
      }), current.services, "https://node");
      const reader = response.body!.getReader();
      expect((await reader.read()).done).toBe(false);
      expect((await reader.read()).done).toBe(true);
    } finally { await current.temp.cleanup(); }
  });

  test("closes revoked streams and releases auth ownership on disconnect", async () => {
    const current = await fixture();
    try {
      const abort = new AbortController();
      const auth = await route(new Request("https://node/sero/v1/auth/events", { headers: current.headers, signal: abort.signal }), current.services, "https://node");
      abort.abort();
      await Bun.sleep(0);
      expect(current.disconnected).toContain(current.enrolled.controllerId);
      const node = await route(new Request("https://node/sero/v1/events", { headers: current.headers }), current.services, "https://node");
      const reader = node.body!.getReader();
      await reader.read();
      await post(current, "revokeController", { controllerId: current.enrolled.controllerId });
      expect((await reader.read()).done).toBe(true);
    } finally { await current.temp.cleanup(); }
  });

  test("rejects an A2A request revoked while its body is pending", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "revoked-a2a" });
      const delayed = delayedRequest("https://node/", current.headers, {
        jsonrpc: "2.0", id: 1, method: "SendStreamingMessage",
        params: { message: { contextId: session.id, parts: [{ text: "run" }] } },
      });
      const response = route(delayed.request, current.services, "https://node");
      await delayed.read;
      await current.services.controllers.revoke(current.enrolled.controllerId);
      delayed.release();

      expect((await response).status).toBe(401);
      expect(current.services.sessions.activeTask(session.id)).toBeUndefined();
    } finally { await current.temp.cleanup(); }
  });

  test("rejects a control mutation revoked while its body is pending", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "revoked-control" });
      const delayed = delayedRequest("https://node/sero/v1/setSessionApprovalMode", current.headers, {
        contextId: session.id, approvalMode: "allow",
      });
      const response = route(delayed.request, current.services, "https://node");
      await delayed.read;
      await current.services.controllers.revoke(current.enrolled.controllerId);
      delayed.release();

      expect((await response).status).toBe(401);
      expect((await current.services.sessions.required(session.id)).approvalMode).toBe("ask");
    } finally { await current.temp.cleanup(); }
  });

  test("emits schema-valid node and auth stream payloads", async () => {
    const current = await fixture();
    try {
      const node = (await sseMessages(await route(new Request("https://node/sero/v1/events", { headers: current.headers }), current.services, "https://node"), 1))[0];
      expect(NodeEventSchema.safeParse(node.data).success).toBe(true);
      const authResponse = await route(new Request("https://node/sero/v1/auth/events", { headers: current.headers }), current.services, "https://node");
      current.services.events.emit("auth", { type: "progress", data: { type: "progress", message: "Waiting" } });
      const auth = (await sseMessages(authResponse, 1))[0];
      expect(AuthEventSchema.safeParse(auth.data).success).toBe(true);
    } finally { await current.temp.cleanup(); }
  });

  test("uses inline artifacts below 1 MB and authenticated URLs at the boundary", async () => {
    const current = await fixture();
    try {
      const small = await current.services.blobs.artifact("session", new Uint8Array(INLINE_ARTIFACT_LIMIT - 1), "application/octet-stream", "small");
      const large = await current.services.blobs.artifact("session", new Uint8Array(INLINE_ARTIFACT_LIMIT), "application/octet-stream", "large");
      expect(JSON.stringify(small)).toContain("raw"); expect(JSON.stringify(large)).toContain("https://node/sero/v1/blob/");
    } finally { await current.temp.cleanup(); }
  });

  test("carries node-owned approvals as data parts and rejects forged ids", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "approval-wire" });
      const task = await current.services.sessions.send(session.id, "run", current.enrolled.controllerId);
      const runner = current.runners.get(session.id)!;
      const decision = runner.hooks!.approve("write", { path: "safe.txt", content: "ok" });
      while ((await current.services.sessions.getTask(task.taskId))?.status !== "input-required") await Bun.sleep(1);
      const required = await (await rpc(current, "GetTask", { id: task.taskId })).json();
      expect(required.result.status.message.parts[0].data).toMatchObject({ type: "approval", toolName: "write" });

      const forged = await rpc(current, "SendMessage", { message: { contextId: session.id, parts: [{ data: { type: "approval_response", approvalId: crypto.randomUUID(), approved: true } }] } });
      expect(await forged.json()).toMatchObject({ error: { message: "approval_not_found" } });
      const approvalId = required.result.status.message.parts[0].data.approvalId as string;
      const accepted = await rpc(current, "SendStreamingMessage", { message: { contextId: session.id, parts: [{ data: { type: "approval_response", approvalId, approved: true, scope: "task" } }] } });
      await accepted.body?.cancel();
      expect(await decision).toBe(true);
      expect(await runner.hooks!.approve("bash", { command: "next" })).toBe(true);
      runner.release?.("done");
      while ((await current.services.sessions.getTask(task.taskId))?.status !== "completed") await Bun.sleep(1);
    } finally { await current.temp.cleanup(); }
  });

  test("publishes explicit outputs as inline and authenticated large task artifacts", async () => {
    const current = await fixture();
    try {
      const session = await current.services.sessions.create({ model: "test/model", workspace: "tool-artifacts" });
      const task = await current.services.sessions.send(session.id, "run", current.enrolled.controllerId);
      const hooks = current.runners.get(session.id)!.hooks!;
      await hooks.artifact("small.txt", new TextEncoder().encode("small"), "text/plain");
      await hooks.artifact("large.bin", new Uint8Array(INLINE_ARTIFACT_LIMIT), "application/octet-stream");
      const wire = await (await rpc(current, "GetTask", { id: task.taskId })).json();
      expect(wire.result.artifacts[0].parts[0].raw).toBeTruthy();
      const url = wire.result.artifacts[1].parts[0].url as string;
      expect(url).toStartWith("https://node/sero/v1/blob/");
      expect((await route(new Request(url, { headers: { "Sero-Control-Version": "1" } }), current.services, "https://node")).status).toBe(401);
      const download = await route(new Request(url, { headers: current.headers }), current.services, "https://node");
      expect(download.status).toBe(200);
      expect((await download.arrayBuffer()).byteLength).toBe(INLINE_ARTIFACT_LIMIT);
      current.runners.get(session.id)?.release?.("done");
      while ((await current.services.sessions.getTask(task.taskId))?.status !== "completed") await Bun.sleep(1);
    } finally { await current.temp.cleanup(); }
  });
});

describe("enrolment", () => {
  test("preserves every code minted concurrently", async () => {
    const temp = await temporaryState();
    try {
      const store = new ControllerStore(await ensureState(temp.root));
      const codes = await Promise.all(Array.from({ length: 12 }, () => store.mintCode()));
      const results = await Promise.all(codes.map(({ code }, index) => store.enrol(code, `profile-${index}`)));
      expect(results).toHaveLength(12);
      expect(await store.list()).toHaveLength(12);
    } finally { await temp.cleanup(); }
  });

  test("serializes concurrent use of a single-use code", async () => {
    const temp = await temporaryState();
    try {
      const store = new ControllerStore(await ensureState(temp.root));
      const { code } = await store.mintCode();
      const results = await Promise.allSettled([store.enrol(code, "one"), store.enrol(code, "two")]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await store.list()).toHaveLength(1);
    } finally { await temp.cleanup(); }
  });
});
