import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels, type AuthEvent as PiAuthEvent, type AuthPrompt, type AuthType } from "@earendil-works/pi-ai";
import { THINKING_LEVELS, type ThinkingLevel } from "@sero-ai/a2a";
import type { EventHub } from "./events.ts";
import type { StatePaths } from "./state.ts";
import { safeMessage } from "./redact.ts";

interface PendingPrompt { id: string; resolve: (value: string) => void; reject: (error: Error) => void }
interface LoginAttempt { controllerId: string; providerId: string; abort: AbortController; prompt?: PendingPrompt }

export class ProviderAuth {
  readonly #runtime: Promise<ModelRuntime>;
  #attempt?: LoginAttempt;
  constructor(readonly paths: StatePaths, readonly events: EventHub, readonly advertised: readonly string[]) {
    this.#runtime = ModelRuntime.create({ authPath: `${paths.root}/auth.json`, modelsStorePath: `${paths.root}/models.json`, refreshOnCreate: false });
  }

  async providers(): Promise<{ oauth: Array<{ id: string; name: string; isLoggedIn: boolean }>; apiKey: Array<{ id: string; name: string; hasKey: boolean; fromEnv: boolean }> }> {
    const runtime = await this.#runtime;
    const statuses = await Promise.all(this.advertised.filter((id) => id !== "bedrock").map(async (id) => {
      const provider = runtime.getProvider(id);
      const check = await runtime.checkAuth(id);
      const env = Object.keys(process.env).some((key) => key.startsWith(id.toUpperCase().replaceAll("-", "_")) && key.endsWith("_API_KEY"));
      return { id, name: provider?.name ?? id, check, env, oauth: Boolean(provider?.auth.oauth), apiKey: Boolean(provider?.auth.apiKey) };
    }));
    return {
      oauth: statuses.filter((item) => item.oauth).map(({ id, name, check }) => ({ id, name, isLoggedIn: check?.type === "oauth" })),
      apiKey: statuses.filter((item) => item.apiKey).map(({ id, name, check, env }) => ({ id, name, hasKey: check?.type === "api_key" || env, fromEnv: env })),
    };
  }

  async models(): Promise<Array<{
    provider: string;
    id: string;
    name: string;
    reasoning: boolean;
    availableThinkingLevels: ThinkingLevel[];
  }>> {
    const runtime = await this.#runtime;
    return runtime.getModels().filter((model) => this.advertised.includes(model.provider)).map((model) => {
      const supported = getSupportedThinkingLevels(model);
      return {
        provider: model.provider,
        id: model.id,
        name: model.name,
        reasoning: model.reasoning,
        availableThinkingLevels: THINKING_LEVELS.filter((level) => supported.includes(level)),
      };
    });
  }

  async login(controllerId: string, providerId: string, type: AuthType = "oauth"): Promise<{ ok: true }> {
    if (this.#attempt) throw new Error("login_in_progress");
    if (!this.advertised.includes(providerId) || providerId === "bedrock") throw new Error("provider_not_available");
    const abort = new AbortController();
    const attempt: LoginAttempt = { controllerId, providerId, abort };
    this.#attempt = attempt;
    void (await this.#runtime).login(providerId, type, {
      signal: abort.signal,
      notify: (event) => this.#notify(event),
      prompt: (prompt) => this.#prompt(attempt, prompt),
    }).then(
      () => this.events.emit("auth", { type: "success", data: { type: "success", provider: providerId, message: "Login complete" } }),
      (error: unknown) => abort.signal.aborted
        ? this.events.emit("auth", { type: "cancelled", data: { type: "cancelled" } })
        : this.events.emit("auth", { type: "error", data: { type: "error", provider: providerId, message: safeMessage(error) } }),
    ).finally(() => { if (this.#attempt === attempt) this.#attempt = undefined; });
    return { ok: true };
  }

  #notify(event: PiAuthEvent): void {
    if (event.type === "auth_url") this.events.emit("auth", { type: "auth", data: { type: "auth", url: event.url, ...(event.instructions ? { instructions: event.instructions } : {}) } });
    else if (event.type === "device_code") this.events.emit("auth", { type: event.type, data: { type: event.type, verificationUri: event.verificationUri, userCode: event.userCode, expiresInSeconds: event.expiresInSeconds ?? 600 } });
    else this.events.emit("auth", { type: event.type === "info" ? "waiting" : "progress", data: { type: event.type === "info" ? "waiting" : "progress", message: event.message } });
  }

  #prompt(attempt: LoginAttempt, prompt: AuthPrompt): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      attempt.prompt = { id, resolve, reject };
      const data = prompt.type === "select"
        ? { type: "select" as const, message: prompt.message, options: prompt.options.map(({ id: optionId, label }) => ({ id: optionId, label })) }
        : prompt.type === "manual_code"
          ? { type: "manual_input" as const, prompt: prompt.message }
          : { type: "prompt" as const, message: prompt.message, ...(prompt.placeholder ? { placeholder: prompt.placeholder } : {}) };
      this.events.emit("auth", { type: data.type, data });
    });
  }

  respond(value: string): void {
    const pending = this.#attempt?.prompt;
    if (!pending) throw new Error("prompt_not_found");
    this.#attempt!.prompt = undefined;
    pending.resolve(value);
  }

  cancel(): void {
    const attempt = this.#attempt;
    if (!attempt) return;
    attempt.prompt?.reject(new Error("login_canceled"));
    attempt.abort.abort(new Error("login_canceled"));
    this.#attempt = undefined;
  }

  disconnect(controllerId: string): void { if (this.#attempt?.controllerId === controllerId) this.cancel(); }
  async logout(providerId: string): Promise<void> { await (await this.#runtime).logout(providerId); }
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    if (!this.advertised.includes(providerId) || providerId === "bedrock") throw new Error("provider_not_available");
    const abort = new AbortController();
    await (await this.#runtime).login(providerId, "api_key", {
      signal: abort.signal,
      notify: () => {},
      prompt: async () => apiKey,
    });
  }
  async removeApiKey(providerId: string): Promise<void> { await (await this.#runtime).logout(providerId); }
}
