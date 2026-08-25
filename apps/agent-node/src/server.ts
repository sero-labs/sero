import {
  A2A_VERSION,
  CONTROL_OPERATION_NAMES,
  SERO_CONTROL_VERSION,
  SERO_EXTENSION_URI,
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
import type { AuthenticatedController, ControlError, TaskTransition } from "./types.ts";
import { safeMessage } from "./redact.ts";
import type { BlobStore } from "./blobs.ts";

const CONTROL_SET = new Set<string>(CONTROL_OPERATION_NAMES);
const TOOLS = ["read", "write", "edit", "bash", "grep", "find"];
type ProviderService = Pick<ProviderAuth, "providers" | "models" | "login" | "logout" | "setApiKey" | "removeApiKey" | "respond" | "cancel">;
interface NodeServices { paths: StatePaths; controllers: ControllerStore; sessions: SessionStore; providers: ProviderService; events: EventHub; blobs: BlobStore; fingerprint: string; providersAdvertised: string[] }
interface ServerOptions { host: string; port: number; publicUrl: string; tls?: boolean }

function json(value: unknown, status = 200, control = false): Response {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (control) headers["Sero-Control-Version"] = SERO_CONTROL_VERSION;
  return Response.json(value, { status, headers });
}
function failure(code: string, message = code, status = 400): Response { return json({ error: { code, message } } satisfies ControlError, status, true); }
function bearer(request: Request): string { return request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? ""; }

export async function startServer(services: NodeServices, options: ServerOptions): Promise<Server<unknown>> {
  const tls = options.tls === false ? undefined : await tlsFiles(services.paths);
  return Bun.serve({
    hostname: options.host, port: options.port, ...(tls ? { tls } : {}),
    fetch: (request) => route(request, services, options.publicUrl),
    error: (error) => json({ error: { code: "internal_error", message: safeMessage(error) } }, 500),
  });
}

export async function route(request: Request, services: NodeServices, publicUrl: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") return json(agentCard(publicUrl));
  if (url.pathname.startsWith("/sero/v1")) return controlRoute(request, url, services);
  if (url.pathname === "/" && request.method === "POST") return a2aRoute(request, services);
  return json({ error: "not_found" }, 404);
}

function agentCard(publicUrl: string): Record<string, unknown> {
  return {
    name: "Sero Agent Node", description: "Persistent remote Sero sessions", version: "1",
    supportedInterfaces: [{ url: `${publicUrl}/`, protocolBinding: "JSONRPC", protocolVersion: A2A_VERSION, tenant: "sero" }],
    capabilities: { streaming: true, extensions: [{ uri: SERO_EXTENSION_URI, required: false, params: { url: `${publicUrl}/sero/v1`, tools: TOOLS } }] },
    securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: "bearer", bearerFormat: "Sero controller token" } } },
    security: [{ schemes: { bearer: [] } }], defaultInputModes: ["text/plain", "application/json"], defaultOutputModes: ["text/plain", "application/json"], skills: [],
  };
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
    const result = await dispatchControl(operation as ControlOperationName, body, controller, services);
    return json(result, 200, true);
  } catch (error) {
    const code = safeMessage(error);
    const hidden = code.includes("session_not_found") ? "session_not_found" : code;
    return failure(hidden, hidden === "session_not_found" ? "Session not found" : hidden, hidden === "session_not_found" ? 404 : 400);
  }
}

async function controlGet(request: Request, url: URL, operation: string, controller: AuthenticatedController, services: NodeServices): Promise<Response> {
  const streamHeaders = { "content-type": "text/event-stream", "cache-control": "no-cache", "Sero-Control-Version": SERO_CONTROL_VERSION };
  if (operation === "events") return new Response(sseStream([{ type: "health", data: { status: "ready" } }], (send) => services.events.subscribe("node", send), request.signal), { headers: streamHeaders });
  if (operation === "auth/events") return new Response(sseStream([], (send) => services.events.subscribe("auth", send), request.signal), { headers: streamHeaders });
  const match = operation.match(/^sessions\/([^/]+)\/events$/);
  if (match) {
    try {
      const replay = await services.sessions.replay(match[1], url.searchParams.get("cursor") ?? undefined);
      const initial: NodeEvent[] = [...(replay.resync ? [{ type: "resync", data: {} }] : []), ...replay.events.map((data) => ({ type: "entry", data })), ...(replay.partial ? [{ type: "partial", data: { text: replay.partial } }] : [])];
      services.events.emit("node", { type: "presence", data: { contextId: match[1], controllerId: controller.id, attached: true } });
      return new Response(sseStream(initial, (send) => services.events.subscribe(`session:${match[1]}`, send), request.signal), { headers: streamHeaders });
    } catch { return failure("session_not_found", "Session not found", 404); }
  }
  const blob = operation.match(/^blob\/([^/]+)$/);
  if (blob) {
    const found = await services.blobs.find(blob[1]);
    return found ? new Response(Buffer.from(found.data), { headers: { "content-type": found.mediaType, "Sero-Control-Version": SERO_CONTROL_VERSION } }) : failure("not_found", "Not found", 404);
  }
  return failure("not_found", "Not found", 404);
}

async function dispatchControl(operation: ControlOperationName, body: Record<string, unknown>, controller: AuthenticatedController | undefined, services: NodeServices): Promise<unknown> {
  switch (operation) {
    case "enrol": return services.controllers.enrol(requiredString(body, "code"), requiredString(body, "profileId"));
    case "mintEnrolmentCode": return services.controllers.mintCode();
    case "listControllers": return { controllers: await services.controllers.list() };
    case "revokeController": { const id = requiredString(body, "controllerId"); const revoked = await services.controllers.revoke(id); if (revoked) await services.sessions.cancelByController(id); return { revoked }; }
    case "listSessions": return { sessions: await services.sessions.list() };
    case "createSession": return services.sessions.create({ name: optionalString(body, "name"), model: requiredString(body, "model"), workspace: requiredString(body, "workspace") });
    case "deleteSession": await services.sessions.delete(requiredString(body, "contextId")); return { deleted: true };
    case "setSessionModel": return services.sessions.setModel(requiredString(body, "contextId"), requiredString(body, "model"));
    case "getNodeHealth": return { status: "ready", fingerprint: services.fingerprint, version: "1", providers: services.providersAdvertised.length };
    case "getProviders": return { providers: await services.providers.providers(), models: await services.providers.models() };
    case "login": return services.providers.login(controller!.id, requiredString(body, "providerId"), optionalString(body, "type") === "api_key" ? "api_key" : "oauth");
    case "logout": await services.providers.logout(requiredString(body, "providerId")); return { ok: true };
    case "setApiKey": await services.providers.setApiKey(requiredString(body, "providerId"), requiredString(body, "apiKey")); return { ok: true };
    case "removeApiKey": await services.providers.removeApiKey(requiredString(body, "providerId")); return { ok: true };
    case "respondPrompt": case "respondSelect": case "respondManualCode": services.providers.respond(requiredString(body, "promptId"), requiredString(body, "value")); return { ok: true };
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
    const params = objectValue(rpc.params); const taskId = stringFrom(params, ["id", "taskId"]);
    if (method === "GetTask") { const task = taskId && await services.sessions.getTask(taskId); if (!task) throw new Error("task_not_found"); return json({ jsonrpc: "2.0", id, result: taskWire(task) }); }
    if (method === "CancelTask") { if (!taskId) throw new Error("task_not_found"); return json({ jsonrpc: "2.0", id, result: taskWire(await services.sessions.cancel(taskId)) }); }
    if (method === "SubscribeToTask") {
      if (!taskId) throw new Error("task_not_found"); const task = await services.sessions.getTask(taskId); if (!task || ["completed", "failed", "canceled", "rejected"].includes(task.status)) throw new Error("unsupported_operation");
      return taskResponse(task, id, services, request.signal);
    }
    if (method === "SendMessage" || method === "SendStreamingMessage") {
      const message = objectValue(params.message ?? params); const contextId = optionalString(message, "contextId") ?? optionalString(params, "contextId");
      const text = extractText(message); const behavior = objectValue(message.metadata).behavior === "steer" ? "steer" : "followUp";
      const task = await services.sessions.send(contextId, text, controller.id, behavior);
      if (method === "SendStreamingMessage") return taskResponse(task, id, services, request.signal);
      await waitTerminal(services.sessions, task.taskId); return json({ jsonrpc: "2.0", id, result: taskWire((await services.sessions.getTask(task.taskId))!) });
    }
    throw new Error("MethodNotFound");
  } catch (error) { return json(rpcError(id, -32000, safeMessage(error)), 400); }
}

function taskResponse(task: TaskTransition, id: unknown, services: NodeServices, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const terminal = new Set(["completed", "failed", "canceled", "rejected"]);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: TaskTransition) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ jsonrpc: "2.0", id, result: taskWire(value) })}\n\n`));
      send(task);
      const unsubscribe = services.events.subscribe(`task:${task.taskId}`, (event) => {
        const value = event.data as TaskTransition; send(value);
        if (terminal.has(value.status)) { unsubscribe(); controller.close(); }
      });
      signal.addEventListener("abort", () => { unsubscribe(); controller.close(); }, { once: true });
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "A2A-Version": A2A_VERSION } });
}

async function waitTerminal(sessions: SessionStore, taskId: string): Promise<void> {
  while (true) { const task = await sessions.getTask(taskId); if (!task || ["completed", "failed", "canceled", "rejected", "auth-required", "input-required"].includes(task.status)) return; await Bun.sleep(10); }
}
function taskWire(task: TaskTransition): Record<string, unknown> { return { id: task.taskId, contextId: task.contextId, status: { state: `TASK_STATE_${task.status.replaceAll("-", "_").toUpperCase()}`, message: task.message ? { role: "ROLE_AGENT", parts: [{ text: task.message }] } : undefined, timestamp: task.updatedAt } }; }
function rpcError(id: unknown, code: number, message: string): Record<string, unknown> { return { jsonrpc: "2.0", id, error: { code, message } }; }
async function readJson(request: Request): Promise<Record<string, unknown>> { const value: unknown = await request.json(); return objectValue(value); }
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function requiredString(value: Record<string, unknown>, key: string): string { const item = optionalString(value, key); if (!item) throw new Error(`invalid_${key}`); return item; }
function optionalString(value: Record<string, unknown>, key: string): string | undefined { return typeof value[key] === "string" ? value[key] : undefined; }
function stringFrom(value: Record<string, unknown>, keys: string[]): string | undefined { return keys.map((key) => optionalString(value, key)).find(Boolean); }
function extractText(message: Record<string, unknown>): string { const direct = optionalString(message, "text"); if (direct) return direct; const parts = Array.isArray(message.parts) ? message.parts : []; return parts.map((part) => optionalString(objectValue(part), "text") ?? "").join(""); }
