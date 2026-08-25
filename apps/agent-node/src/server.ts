import {
  A2A_VERSION,
  CONTROL_OPERATION_NAMES,
  ControlOperationSchemas,
  AuthEventSchema,
  NodeEventSchema,
  SessionEventSchema,
  SERO_CONTROL_VERSION,
  SERO_QUEUE_MODE_METADATA_KEY,
  createSeroAgentCard,
  type ControlError,
  type ControlErrorCode,
  type ControlOperationName,
} from "@sero-ai/a2a";
import type { Server } from "bun";
import type { ControllerStore } from "./controllers.ts";
import type { EventHub, NodeEvent } from "./events.ts";
import { sseStream } from "./events.ts";
import type { ProviderAuth } from "./provider-auth.ts";
import type { SessionStore } from "./sessions.ts";
import type { StatePaths } from "./state.ts";
import { tlsFiles } from "./state.ts";
import type { AuthenticatedController, TaskTransition } from "./types.ts";
import { safeMessage } from "./redact.ts";
import type { BlobStore } from "./blobs.ts";

const CONTROL_SET = new Set<string>(CONTROL_OPERATION_NAMES);
const TOOLS = ["read", "write", "edit", "bash", "grep", "find"];
type ProviderService = Pick<ProviderAuth, "providers" | "models" | "login" | "logout" | "setApiKey" | "removeApiKey" | "respond" | "cancel" | "disconnect">;
interface NodeServices { paths: StatePaths; controllers: ControllerStore; sessions: SessionStore; providers: ProviderService; events: EventHub; blobs: BlobStore; fingerprint: string; providersAdvertised: string[] }
interface ServerOptions { host: string; port: number; publicUrl: string; tls?: boolean }
const STARTED_AT = new Date().toISOString();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function json(value: unknown, status = 200, control = false): Response {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (control) headers["Sero-Control-Version"] = SERO_CONTROL_VERSION;
  return Response.json(value, { status, headers });
}
function failure(code: ControlErrorCode, message: string = code, status = 400): Response { return json({ error: { code, message } } satisfies ControlError, status, true); }
function bearer(request: Request): string { return request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? ""; }

export async function startServer(services: NodeServices, options: ServerOptions): Promise<Server> {
  const tls = options.tls === false ? undefined : await tlsFiles(services.paths);
  return Bun.serve({
    hostname: options.host, port: options.port, ...(tls ? { tls } : {}),
    fetch: (request) => route(request, services, options.publicUrl),
    error: (error) => json({ error: { code: "internal_error", message: safeMessage(error) } }, 500),
  });
}

export async function route(request: Request, services: NodeServices, publicUrl: string): Promise<Response> {
  const url = URL.parse(request.url);
  if (!url) return json({ error: "invalid_url" }, 400);
  if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") return json(agentCard(publicUrl));
  if (url.pathname.startsWith("/sero/v1")) return controlRoute(request, url, services);
  if (url.pathname === "/" && request.method === "POST") return a2aRoute(request, services);
  return json({ error: "not_found" }, 404);
}

function agentCard(publicUrl: string) {
  return createSeroAgentCard({
    card: {
      name: "Sero Agent Node",
      description: "Persistent remote Sero sessions",
      provider: undefined,
      version: "1",
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["text/plain", "application/json"],
      skills: [],
      signatures: [],
    },
    a2aUrl: `${publicUrl}/`,
    controlUrl: `${publicUrl}/sero/v1`,
    tenant: "sero",
    tools: TOOLS,
  });
}

async function authorized(request: Request, services: NodeServices): Promise<AuthenticatedController | undefined> {
  return services.controllers.authenticate(bearer(request));
}

async function controlRoute(request: Request, url: URL, services: NodeServices): Promise<Response> {
  const operation = url.pathname.slice("/sero/v1/".length);
  const isEnrol = operation === "enrol" && request.method === "POST";
  if (request.headers.get("Sero-Control-Version") !== SERO_CONTROL_VERSION) return failure("version_mismatch", "Unsupported Sero control version", 400);
  const controller = isEnrol ? undefined : await authorized(request, services);
  if (!isEnrol && !controller) return failure("unauthorized", "Unauthorized", 401);
  if (request.method === "GET") return controlGet(request, url, operation, controller!, services);
  if (request.method !== "POST" || !CONTROL_SET.has(operation)) return failure("not_found", "Not found", 404);
  const body = await readJson(request);
  try {
    const name = operation as ControlOperationName;
    const input = ControlOperationSchemas[name].request.parse(body);
    const result = await dispatchControl(name, input, controller, services);
    return json(ControlOperationSchemas[name].response.parse(result), 200, true);
  } catch (error) {
    const message = safeMessage(error);
    if (message.includes("session_not_found") || message === "not_found") return failure("not_found", message.includes("session") ? "Session not found" : "Not found", 404);
    if (message === "login_in_progress") return failure("conflict", "Login already in progress", 409);
    return failure("invalid_request", "Invalid request", 400);
  }
}

async function controlGet(request: Request, url: URL, operation: string, controller: AuthenticatedController, services: NodeServices): Promise<Response> {
  const streamHeaders = { "content-type": "text/event-stream", "cache-control": "no-cache", "Sero-Control-Version": SERO_CONTROL_VERSION };
  if (operation === "events") {
    const health = nodeHealth(services);
    return new Response(sseStream([{ type: "health", data: NodeEventSchema.parse({ type: "health", health }) }], (send, close) => services.events.subscribe("node", send, controller.id, close), request.signal), { headers: streamHeaders });
  }
  if (operation === "auth/events") return new Response(sseStream([], (send, close) => services.events.subscribe("auth", (event) => send({ type: event.type, data: AuthEventSchema.parse(event.data) }), controller.id, close), request.signal, () => services.providers.disconnect(controller.id)), { headers: streamHeaders });
  const match = operation.match(/^sessions\/([^/]+)\/events$/);
  if (match) {
    const buffered = services.events.subscribeBuffered(`session:${match[1]}`, controller.id);
    try {
      requireUuid(match[1], "contextId");
      const replay = await services.sessions.replay(match[1], url.searchParams.get("cursor") ?? undefined);
      const task = services.sessions.activeTask(match[1]);
      const initial: NodeEvent[] = [
        ...(replay.resync ? [{ type: "resync", data: SessionEventSchema.parse({ type: "resync" }) }] : []),
        ...replay.events.map((entry) => ({ type: "entry", id: entry.id, data: SessionEventSchema.parse({ type: "entry", entry: { id: entry.id, parentId: entry.parentId, data: entry } }) })),
        ...(replay.partial && task ? [{ type: "snapshot", data: SessionEventSchema.parse({ type: "snapshot", taskId: task.taskId, message: { role: "assistant", text: replay.partial, partial: true } }) }] : []),
      ];
      services.events.emit("node", { type: "presence", data: NodeEventSchema.parse({ type: "presence", contextId: match[1], controllerIds: [controller.id] }) });
      return new Response(sseStream(initial, (send, close) => buffered.activate((event) => {
        const normalized = sessionEvent(event, services.sessions.activeTask(match[1])?.taskId);
        if (normalized) send(normalized);
      }, close), request.signal), { headers: streamHeaders });
    } catch {
      buffered.unsubscribe();
      return failure("not_found", "Session not found", 404);
    }
  }
  const blob = operation.match(/^blob\/([^/]+)$/);
  if (blob) {
    if (!UUID_PATTERN.test(blob[1])) return failure("invalid_request", "Invalid blob id", 400);
    const found = await services.blobs.find(blob[1]);
    return found ? new Response(Buffer.from(found.data), { headers: { "content-type": found.mediaType, "Sero-Control-Version": SERO_CONTROL_VERSION } }) : failure("not_found", "Not found", 404);
  }
  return failure("not_found", "Not found", 404);
}

async function dispatchControl(operation: ControlOperationName, body: Record<string, unknown>, controller: AuthenticatedController | undefined, services: NodeServices): Promise<unknown> {
  switch (operation) {
    case "enrol": return services.controllers.enrol(requiredString(body, "code"), requiredString(body, "controllerName"));
    case "mintEnrolmentCode": return services.controllers.mintCode();
    case "listControllers": return { controllers: (await services.controllers.list()).map((item) => ({ id: item.id, name: item.profileId, createdAt: item.createdAt, lastSeenAt: null })) };
    case "revokeController": {
      const id = requireUuid(requiredString(body, "controllerId"), "controllerId");
      if (!(await services.controllers.revoke(id))) throw new Error("not_found");
      await services.sessions.cancelByController(id);
      services.providers.disconnect(id);
      services.events.disconnectController(id);
      return { ok: true };
    }
    case "listSessions": return { sessions: (await services.sessions.list()).map((record) => sessionWire(record, services.sessions.activeTask(record.id)?.taskId ?? null)) };
    case "createSession": {
      const workspace = requiredString(body, "workspace");
      requireWorkspace(workspace);
      const record = await services.sessions.create({ name: optionalString(body, "name"), model: modelString(objectValue(body.model)), workspace });
      return { session: sessionWire(record, null) };
    }
    case "deleteSession": await services.sessions.delete(requireUuid(requiredString(body, "contextId"), "contextId")); return { ok: true };
    case "setSessionModel": {
      const record = await services.sessions.setModel(requireUuid(requiredString(body, "contextId"), "contextId"), modelString(objectValue(body.model)));
      return { session: sessionWire(record, services.sessions.activeTask(record.id)?.taskId ?? null) };
    }
    case "getNodeHealth": return { health: nodeHealth(services) };
    case "getProviders": return { ...(await services.providers.providers()), models: (await services.providers.models()).map((model) => ({ providerId: model.provider, modelId: model.id, name: model.name })) };
    case "login": return services.providers.login(controller!.id, requiredString(body, "providerId"));
    case "logout": await services.providers.logout(requiredString(body, "providerId")); return { ok: true };
    case "setApiKey": await services.providers.setApiKey(requiredString(body, "providerId"), requiredString(body, "key")); return { ok: true };
    case "removeApiKey": await services.providers.removeApiKey(requiredString(body, "providerId")); return { ok: true };
    case "respondPrompt": case "respondSelect": case "respondManualCode": services.providers.respond(requiredString(body, "value")); return { accepted: true };
    case "cancel": services.providers.cancel(); return { ok: true };
  }
}

async function a2aRoute(request: Request, services: NodeServices): Promise<Response> {
  if (request.headers.get("A2A-Version") !== A2A_VERSION) return json(rpcError(null, -32009, "VersionNotSupportedError"), 400);
  const controller = await authorized(request, services);
  if (!controller) return json(rpcError(null, -32001, "Unauthorized"), 401);
  const rpc = await readJson(request); const id = rpc.id ?? null; const method = optionalString(rpc, "method");
  try {
    if (!method) throw new Error("MethodNotFound");
    const params = objectValue(rpc.params); const rawTaskId = stringFrom(params, ["id", "taskId"]); const taskId = rawTaskId ? requireUuid(rawTaskId, "taskId") : undefined;
    if (method === "GetTask") { const task = taskId && await services.sessions.getTask(taskId); if (!task) throw new Error("task_not_found"); return json({ jsonrpc: "2.0", id, result: taskWire(task) }); }
    if (method === "CancelTask") { if (!taskId) throw new Error("task_not_found"); return json({ jsonrpc: "2.0", id, result: taskWire(await services.sessions.cancel(taskId)) }); }
    if (method === "SubscribeToTask") {
      if (!taskId) throw new Error("task_not_found"); const task = await services.sessions.getTask(taskId); if (!task || ["completed", "failed", "canceled", "rejected"].includes(task.status)) throw new Error("unsupported_operation");
      return taskResponse(task, id, services, request.signal, controller.id);
    }
    if (method === "SendMessage" || method === "SendStreamingMessage") {
      const message = objectValue(params.message ?? params); const rawContextId = optionalString(message, "contextId") ?? optionalString(params, "contextId");
      const contextId = rawContextId ? requireUuid(rawContextId, "contextId") : undefined;
      const approval = extractApproval(message);
      const text = extractText(message);
      const behavior = objectValue(message.metadata)[SERO_QUEUE_MODE_METADATA_KEY] === "steer" ? "steer" : "followUp";
      const task = approval && contextId
        ? await services.sessions.respondApproval(contextId, requireUuid(approval.approvalId, "approvalId"), approval.approved)
        : await services.sessions.send(contextId, text, controller.id, behavior);
      if (method === "SendStreamingMessage") return taskResponse(task, id, services, request.signal, controller.id);
      await waitTerminal(services.sessions, task.taskId); return json({ jsonrpc: "2.0", id, result: { task: taskWire((await services.sessions.getTask(task.taskId))!) } });
    }
    throw new Error("MethodNotFound");
  } catch (error) { return json(rpcError(id, -32000, safeMessage(error)), 400); }
}

function taskResponse(task: TaskTransition, id: unknown, services: NodeServices, signal: AbortSignal, controllerId: string): Response {
  const encoder = new TextEncoder();
  const terminal = new Set(["completed", "failed", "canceled", "rejected"]);
  let closeStream = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      const send = (value: TaskTransition) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ jsonrpc: "2.0", id, result: { task: taskWire(value) } })}\n\n`));
      const cleanup = () => { if (closed) return; closed = true; unsubscribe(); };
      const close = () => { if (closed) return; cleanup(); controller.close(); };
      send(task);
      unsubscribe = services.events.subscribe(`task:${task.taskId}`, (event) => {
        if (closed) return;
        const value = event.data as TaskTransition; send(value);
        if (terminal.has(value.status)) close();
      }, controllerId, close);
      closeStream = cleanup;
      signal.addEventListener("abort", close, { once: true });
    },
    cancel() { closeStream(); },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "A2A-Version": A2A_VERSION } });
}

async function waitTerminal(sessions: SessionStore, taskId: string): Promise<void> {
  while (true) { const task = await sessions.getTask(taskId); if (!task || ["completed", "failed", "canceled", "rejected", "auth-required", "input-required"].includes(task.status)) return; await Bun.sleep(10); }
}
function taskWire(task: TaskTransition): Record<string, unknown> {
  const parts = task.input
    ? [{ data: { type: "approval", approvalId: task.input.approvalId, toolName: task.input.toolName, input: task.input.input } }]
    : task.message ? [{ text: task.message }] : undefined;
  return {
    id: task.taskId, contextId: task.contextId,
    status: {
      state: `TASK_STATE_${task.status.replaceAll("-", "_").toUpperCase()}`,
      message: parts ? {
        role: "ROLE_AGENT",
        messageId: `${task.taskId}:status`,
        contextId: task.contextId,
        taskId: task.taskId,
        parts,
      } : undefined,
      timestamp: task.updatedAt,
    },
    artifacts: task.artifacts ?? [],
    history: [],
  };
}
function rpcError(id: unknown, code: number, message: string): Record<string, unknown> { return { jsonrpc: "2.0", id, error: { code, message } }; }
async function readJson(request: Request): Promise<Record<string, unknown>> { const value: unknown = await request.json(); return objectValue(value); }
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function requiredString(value: Record<string, unknown>, key: string): string { const item = optionalString(value, key); if (!item) throw new Error(`invalid_${key}`); return item; }
function optionalString(value: Record<string, unknown>, key: string): string | undefined { return typeof value[key] === "string" ? value[key] : undefined; }
function stringFrom(value: Record<string, unknown>, keys: string[]): string | undefined { return keys.map((key) => optionalString(value, key)).find(Boolean); }
function extractText(message: Record<string, unknown>): string { const direct = optionalString(message, "text"); if (direct) return direct; const parts = Array.isArray(message.parts) ? message.parts : []; return parts.map((part) => optionalString(objectValue(part), "text") ?? "").join(""); }
function extractApproval(message: Record<string, unknown>): { approvalId: string; approved: boolean } | undefined {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  for (const part of parts) {
    const data = objectValue(objectValue(part).data);
    if (data.type === "approval_response" && typeof data.approvalId === "string" && typeof data.approved === "boolean") {
      return { approvalId: data.approvalId, approved: data.approved };
    }
  }
  return undefined;
}

function requireUuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`invalid_${name}`);
  return value;
}

function requireWorkspace(value: string): void {
  if (value.startsWith("/") || value.startsWith("\\") || value.split(/[\\/]/u).some((part) => part === ".." || part === "")) throw new Error("invalid_workspace");
}

function modelString(model: Record<string, unknown>): string {
  return `${requiredString(model, "providerId")}/${requiredString(model, "modelId")}`;
}

function modelWire(model: string): { providerId: string; modelId: string } {
  const separator = model.indexOf("/");
  return separator > 0 ? { providerId: model.slice(0, separator), modelId: model.slice(separator + 1) } : { providerId: "custom", modelId: model };
}

function sessionWire(record: { id: string; name: string; workspace: string; model: string; updatedAt: string }, runningTaskId: string | null): Record<string, unknown> {
  return { contextId: record.id, name: record.name, workspace: record.workspace, model: modelWire(record.model), updatedAt: record.updatedAt, runningTaskId };
}

function nodeHealth(services: NodeServices): Record<string, unknown> {
  return { status: "healthy", nodeId: services.fingerprint, nodeName: "Sero Agent Node", version: "1", startedAt: STARTED_AT };
}

function sessionEvent(event: NodeEvent, taskId?: string): NodeEvent | undefined {
  if (event.type === "entry") {
    const entry = objectValue(event.data);
    const id = optionalString(entry, "id");
    if (!id) return undefined;
    return { type: "entry", id, data: SessionEventSchema.parse({ type: "entry", entry: { id, parentId: optionalString(entry, "parentId") ?? null, data: entry } }) };
  }
  if (event.type === "delta" && taskId) {
    const delta = objectValue(event.data);
    return { type: "delta", data: SessionEventSchema.parse({ type: "delta", taskId, delta: { delta: optionalString(delta, "text") ?? "", messageId: taskId } }) };
  }
  return undefined;
}
