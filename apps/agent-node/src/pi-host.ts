import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type InlineExtension,
  type SessionEntry,
  type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { ModelsError } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@sero-ai/a2a";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { StatePaths } from "./state.ts";
import { ToolInputStreams } from "./tool-input-stream.ts";

export interface SessionRunner {
  readonly sessionPath: string;
  run(text: string, behavior: "followUp" | "steer", hooks: RunnerHooks): Promise<string>;
  cancel(): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  entries(): SessionEntry[];
}

export interface RunnerHooks {
  onEvent(event: RunnerStreamEvent): void;
  approve(toolName: "write" | "edit" | "bash", input: Record<string, unknown>): Promise<boolean>;
  artifact(name: string, data: Uint8Array, mediaType: string): Promise<void>;
}

export type RunnerStreamEvent =
  | { kind: "assistant_start"; messageId: string }
  | { kind: "assistant_end"; messageId: string; text: string; thinking?: string }
  | { kind: "text" | "thinking"; messageId: string; delta: string }
  | { kind: "tool_input_start"; streamKey: string; toolName: string }
  | { kind: "tool_input_delta"; streamKey: string; delta: string; replace: boolean; path: string | null }
  | { kind: "tool_input_end"; streamKey: string; toolCallId: string }
  | { kind: "tool_start"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { kind: "tool_update"; toolCallId: string; output: string | null }
  | { kind: "tool_end"; toolCallId: string; output: string | null; isError: boolean };

export type SessionRunnerFactory = (
  sessionId: string,
  cwd: string,
  model: string,
  thinkingLevel: ThinkingLevel,
  sessionPath?: string,
  hooks?: RunnerHooks,
) => Promise<SessionRunner>;

export class ProviderAuthRequiredError extends Error {
  constructor(readonly providerId: string) { super(`Provider authentication required: ${providerId}`); }
}

function modelParts(value: string): [string, string] {
  const slash = value.indexOf("/");
  if (slash < 1 || slash === value.length - 1) throw new Error(`model_unavailable: ${value}`);
  return [value.slice(0, slash), value.slice(slash + 1)];
}

export function createPiRunnerFactory(paths: StatePaths): SessionRunnerFactory {
  return async (sessionId, cwd, modelName, thinkingLevel, sessionPath, hooks) => {
    const runtime = await ModelRuntime.create({ authPath: `${paths.root}/auth.json`, modelsStorePath: `${paths.root}/models.json`, refreshOnCreate: false });
    const [provider, id] = modelParts(modelName);
    const model = runtime.getModel(provider, id);
    if (!model) throw new Error(`model_unavailable: ${modelName}`);
    try {
      const auth = await runtime.getAuth(model);
      const definition = runtime.getProvider(provider);
      if (!auth && (definition?.auth.apiKey || definition?.auth.oauth)) throw new ProviderAuthRequiredError(provider);
    } catch (error) {
      if (error instanceof ProviderAuthRequiredError) throw error;
      if (error instanceof ModelsError && (error.code === "auth" || error.code === "oauth")) throw new ProviderAuthRequiredError(provider);
      throw error;
    }
    const manager = sessionPath
      ? SessionManager.open(sessionPath, paths.sessions, cwd)
      : SessionManager.create(cwd, paths.sessions, { id: sessionId });
    let providerRejectedAuth = false;
    const extension: InlineExtension = (pi) => {
      pi.on("tool_call", (event) => prepareToolCall(event, hooks, cwd));
      pi.on("after_provider_response", (event) => { if (event.status === 401 || event.status === 403) providerRejectedAuth = true; });
    };
    const services = await createAgentSessionServices({
      cwd, agentDir: paths.root, modelRuntime: runtime,
      resourceLoaderOptions: { extensionFactories: [{ name: "sero-node", hidden: true, factory: extension }] },
    });
    const created = await createAgentSessionFromServices({
      services, model, thinkingLevel, sessionManager: manager, tools: ["read", "write", "edit", "bash", "grep", "find"],
    });
    const authoritativePath = manager.getSessionFile();
    if (!authoritativePath) throw new Error(`session_persistence_unavailable: ${sessionId}`);
    if (!hooks) throw new Error(`runner_hooks_unavailable: ${sessionId}`);
    return new PiRunner(created.session, manager, authoritativePath, provider, () => providerRejectedAuth, hooks);
  };
}

const GATED_TOOLS = new Set(["write", "edit", "bash"]);
const WORKSPACE_TOOLS = new Set(["read", "grep", "find"]);

export function prepareToolCall(event: ToolCallEvent, hooks?: RunnerHooks, workspace?: string): Promise<{ block?: boolean; reason?: string; terminate?: boolean }> {
  if (event.toolName === "bash") delete event.input.timeout;
  return gateToolPermission(event, hooks, workspace);
}

export async function gateToolPermission(event: ToolCallEvent, hooks?: RunnerHooks, workspace?: string): Promise<{ block?: boolean; reason?: string; terminate?: boolean }> {
  const inputPath = "path" in event.input ? event.input.path : undefined;
  if (WORKSPACE_TOOLS.has(event.toolName) && !(await confinedToolPath(inputPath, workspace))) {
    return { block: true, reason: "Read-only tools are confined to the session workspace", terminate: true };
  }
  if (!hooks || !GATED_TOOLS.has(event.toolName)) return {};
  const approved = await hooks.approve(event.toolName as "write" | "edit" | "bash", event.input);
  return approved ? {} : { block: true, reason: "Controller refused tool permission", terminate: true };
}

async function confinedToolPath(inputPath: unknown, workspace?: string): Promise<boolean> {
  if (!workspace) return false;
  const requested = inputPath === undefined ? "." : inputPath;
  if (typeof requested !== "string") return false;
  const normalized = normalizeToolPath(requested);
  if (normalized === null) return false;
  const root = await realpath(workspace);
  const target = resolve(root, normalized);
  const actual = await realpath(target).catch(() => null);
  return pathInside(root, actual ?? target);
}

function normalizeToolPath(input: string): string | null {
  let normalized = input.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/gu, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  if (normalized === "~") return homedir();
  if (normalized.startsWith("~/")) return join(homedir(), normalized.slice(2));
  if (!normalized.startsWith("file://")) return normalized;
  try {
    return fileURLToPath(normalized);
  } catch {
    return null;
  }
}

function pathInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
}

class PiRunner implements SessionRunner {
  private activeRuns = 0;
  private currentAssistantId: string | null = null;
  private readonly toolInputStreams = new ToolInputStreams();
  private unsubscribe?: () => void;

  constructor(
    readonly session: AgentSession,
    readonly manager: SessionManager,
    readonly sessionPath: string,
    readonly providerId: string,
    readonly providerRejectedAuth: () => boolean,
    readonly hooks: RunnerHooks,
  ) {}

  async run(text: string, behavior: "followUp" | "steer", _hooks: RunnerHooks): Promise<string> {
    let result = "";
    this.activeRuns++;
    this.unsubscribe ??= this.session.subscribe((event) => {
      const delta = this.#forward(event);
      if (delta) result += delta;
    });
    try {
      await this.session.prompt(text, { streamingBehavior: this.session.isStreaming ? behavior : undefined });
      if (this.providerRejectedAuth()) throw new ProviderAuthRequiredError(this.providerId);
      return result;
    } finally {
      this.activeRuns--;
      if (this.activeRuns === 0) {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
      }
    }
  }

  #forward(event: AgentSessionEvent): string {
    if (event.type === "message_start" && event.message.role === "assistant") {
      this.toolInputStreams.reset();
      this.currentAssistantId = `live:${crypto.randomUUID()}`;
      this.hooks.onEvent({ kind: "assistant_start", messageId: this.currentAssistantId });
      return "";
    }
    if (event.type === "message_update" && this.currentAssistantId) {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta" || update.type === "thinking_delta") {
        this.hooks.onEvent({ kind: update.type === "text_delta" ? "text" : "thinking", messageId: this.currentAssistantId, delta: update.delta });
        return update.type === "text_delta" ? update.delta : "";
      }
      if (update.type === "toolcall_start") {
        const started = this.toolInputStreams.start(update.partial, update.contentIndex);
        if (started) this.hooks.onEvent({ kind: "tool_input_start", ...started });
      } else if (update.type === "toolcall_delta") {
        const chunk = this.toolInputStreams.advance(update.partial, update.contentIndex);
        if (chunk) this.hooks.onEvent({ kind: "tool_input_delta", ...chunk });
      } else if (update.type === "toolcall_end") {
        const finished = this.toolInputStreams.end(update.toolCall, update.contentIndex);
        if (finished) {
          this.hooks.onEvent({ kind: "tool_input_delta", streamKey: finished.streamKey, ...finished.final });
          this.hooks.onEvent({ kind: "tool_input_end", streamKey: finished.streamKey, toolCallId: finished.toolCallId });
        }
      }
    }
    if (event.type === "message_end" && event.message.role === "assistant" && this.currentAssistantId) {
      this.toolInputStreams.reset();
      const messageId = this.currentAssistantId;
      this.currentAssistantId = null;
      this.hooks.onEvent({ kind: "assistant_end", messageId, ...assistantText(event.message.content) });
    }
    if (event.type === "tool_execution_start") {
      const input: Record<string, unknown> = { ...event.args };
      if (event.toolName === "bash") delete input.timeout;
      this.hooks.onEvent({ kind: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName, input });
    }
    if (event.type === "tool_execution_update") {
      this.hooks.onEvent({ kind: "tool_update", toolCallId: event.toolCallId, output: toolText(event.partialResult) });
    }
    if (event.type === "tool_execution_end") {
      this.hooks.onEvent({ kind: "tool_end", toolCallId: event.toolCallId, output: toolText(event.result), isError: event.isError });
    }
    return "";
  }

  cancel(): Promise<void> { return this.session.abort(); }
  setThinkingLevel(level: ThinkingLevel): void { this.session.setThinkingLevel(level); }
  entries(): SessionEntry[] { return this.manager.getEntries(); }
}

function assistantText(content: Array<{ type: string; text?: string; thinking?: string }>): { text: string; thinking?: string } {
  const text = content.flatMap((part) => part.type === "text" && part.text ? [part.text] : []).join("");
  const thinking = content.flatMap((part) => part.type === "thinking" && part.thinking ? [part.thinking] : []).join("");
  return thinking ? { text, thinking } : { text };
}

function toolText(result: { content?: Array<{ type: string; text?: string }> } | undefined): string | null {
  return result?.content?.flatMap((part) => part.type === "text" && part.text ? [part.text] : []).join("\n") || null;
}
