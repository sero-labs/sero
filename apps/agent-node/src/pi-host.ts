import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { StatePaths } from "./state.ts";

export interface SessionRunner {
  readonly sessionPath: string;
  run(text: string, behavior: "followUp" | "steer", onDelta: (text: string) => void): Promise<string>;
  cancel(): Promise<void>;
  entries(): SessionEntry[];
}

export type SessionRunnerFactory = (
  sessionId: string,
  cwd: string,
  model: string,
  sessionPath?: string,
) => Promise<SessionRunner>;

function modelParts(value: string): [string, string] {
  const slash = value.indexOf("/");
  if (slash < 1 || slash === value.length - 1) throw new Error(`model_unavailable: ${value}`);
  return [value.slice(0, slash), value.slice(slash + 1)];
}

export function createPiRunnerFactory(paths: StatePaths): SessionRunnerFactory {
  return async (sessionId, cwd, modelName, sessionPath) => {
    const runtime = await ModelRuntime.create({ authPath: `${paths.root}/auth.json`, modelsStorePath: `${paths.root}/models.json`, refreshOnCreate: false });
    const [provider, id] = modelParts(modelName);
    const model = runtime.getModel(provider, id);
    if (!model) throw new Error(`model_unavailable: ${modelName}`);
    const manager = sessionPath
      ? SessionManager.open(sessionPath, paths.sessions, cwd)
      : SessionManager.create(cwd, paths.sessions, { id: sessionId });
    const created = await createAgentSession({
      cwd, agentDir: paths.root, modelRuntime: runtime, model, sessionManager: manager,
      tools: ["read", "write", "edit", "bash", "grep", "find"],
    });
    const authoritativePath = manager.getSessionFile();
    if (!authoritativePath) throw new Error(`session_persistence_unavailable: ${sessionId}`);
    return new PiRunner(created.session, manager, authoritativePath);
  };
}

class PiRunner implements SessionRunner {
  constructor(
    readonly session: AgentSession,
    readonly manager: SessionManager,
    readonly sessionPath: string,
  ) {}

  async run(text: string, behavior: "followUp" | "steer", onDelta: (text: string) => void): Promise<string> {
    let result = "";
    const unsubscribe = this.session.subscribe((event) => {
      if (event.type !== "message_update") return;
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") {
        result += update.delta;
        onDelta(update.delta);
      }
    });
    try {
      await this.session.prompt(text, { streamingBehavior: this.session.isStreaming ? behavior : undefined });
      return result;
    } finally {
      unsubscribe();
    }
  }

  cancel(): Promise<void> { return this.session.abort(); }
  entries(): SessionEntry[] { return this.manager.getEntries(); }
}
