import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type InlineExtension,
  type SessionEntry,
  type ToolCallEvent,
  type ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { ModelsError } from "@earendil-works/pi-ai";
import type { StatePaths } from "./state.ts";

export interface SessionRunner {
  readonly sessionPath: string;
  run(text: string, behavior: "followUp" | "steer", hooks: RunnerHooks): Promise<string>;
  cancel(): Promise<void>;
  entries(): SessionEntry[];
}

export interface RunnerHooks {
  onDelta(text: string): void;
  approve(toolName: "write" | "edit" | "bash", input: Record<string, unknown>): Promise<boolean>;
  artifact(name: string, data: Uint8Array, mediaType: string): Promise<void>;
}

export type SessionRunnerFactory = (
  sessionId: string,
  cwd: string,
  model: string,
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
  return async (sessionId, cwd, modelName, sessionPath, hooks) => {
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
      pi.on("tool_call", (event) => gateToolPermission(event, hooks));
      pi.on("tool_result", (event) => captureArtifact(event, hooks));
      pi.on("after_provider_response", (event) => { if (event.status === 401 || event.status === 403) providerRejectedAuth = true; });
    };
    const services = await createAgentSessionServices({
      cwd, agentDir: paths.root, modelRuntime: runtime,
      resourceLoaderOptions: { extensionFactories: [{ name: "sero-node", hidden: true, factory: extension }] },
    });
    const created = await createAgentSessionFromServices({
      services, model, sessionManager: manager, tools: ["read", "write", "edit", "bash", "grep", "find"],
    });
    const authoritativePath = manager.getSessionFile();
    if (!authoritativePath) throw new Error(`session_persistence_unavailable: ${sessionId}`);
    return new PiRunner(created.session, manager, authoritativePath, provider, () => providerRejectedAuth);
  };
}

const GATED_TOOLS = new Set(["write", "edit", "bash"]);
export async function gateToolPermission(event: ToolCallEvent, hooks?: RunnerHooks): Promise<{ block?: boolean; reason?: string; terminate?: boolean }> {
  if (!hooks || !GATED_TOOLS.has(event.toolName)) return {};
  const approved = await hooks.approve(event.toolName as "write" | "edit" | "bash", event.input);
  return approved ? {} : { block: true, reason: "Controller refused tool permission", terminate: true };
}

async function captureArtifact(event: ToolResultEvent, hooks?: RunnerHooks): Promise<void> {
  if (!hooks) return;
  const payload = JSON.stringify({ toolName: event.toolName, toolCallId: event.toolCallId, content: event.content, details: event.details });
  await hooks.artifact(`${event.toolName}-${event.toolCallId}.json`, new TextEncoder().encode(payload), "application/json");
}

class PiRunner implements SessionRunner {
  constructor(
    readonly session: AgentSession,
    readonly manager: SessionManager,
    readonly sessionPath: string,
    readonly providerId: string,
    readonly providerRejectedAuth: () => boolean,
  ) {}

  async run(text: string, behavior: "followUp" | "steer", hooks: RunnerHooks): Promise<string> {
    let result = "";
    const unsubscribe = this.session.subscribe((event) => {
      if (event.type !== "message_update") return;
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") {
        result += update.delta;
        hooks.onDelta(update.delta);
      }
    });
    try {
      await this.session.prompt(text, { streamingBehavior: this.session.isStreaming ? behavior : undefined });
      if (this.providerRejectedAuth()) throw new ProviderAuthRequiredError(this.providerId);
      return result;
    } finally {
      unsubscribe();
    }
  }

  cancel(): Promise<void> { return this.session.abort(); }
  entries(): SessionEntry[] { return this.manager.getEntries(); }
}
