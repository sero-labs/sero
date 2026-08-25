import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AuthPrompt, AuthType } from "@earendil-works/pi-ai";
import type { EventHub } from "./events.ts";
import type { StatePaths } from "./state.ts";
import type { ProviderStatus } from "./types.ts";
import { safeMessage } from "./redact.ts";

interface PendingPrompt { id: string; resolve: (value: string) => void; reject: (error: Error) => void }
interface LoginAttempt { controllerId: string; providerId: string; abort: AbortController; prompt?: PendingPrompt }

export class ProviderAuth {
  readonly #runtime: Promise<ModelRuntime>;
  #attempt?: LoginAttempt;
  constructor(readonly paths: StatePaths, readonly events: EventHub, readonly advertised: readonly string[]) {
    this.#runtime = ModelRuntime.create({ authPath: `${paths.root}/auth.json`, modelsStorePath: `${paths.root}/models.json`, refreshOnCreate: false });
  }

  async providers(): Promise<ProviderStatus[]> {
    const runtime = await this.#runtime;
    return Promise.all(this.advertised.filter((id) => id !== "bedrock").map(async (id) => {
      const check = await runtime.checkAuth(id);
      const env = Object.keys(process.env).some((key) => key.startsWith(id.toUpperCase().replaceAll("-", "_")) && key.endsWith("_API_KEY"));
      return { id, configured: Boolean(check) || env, source: env ? "environment" : check ? "stored" : "none" } as ProviderStatus;
    }));
  }

  async models(): Promise<Array<{ provider: string; id: string; name: string }>> {
    const runtime = await this.#runtime;
    return runtime.getModels().filter((model) => this.advertised.includes(model.provider)).map(({ provider, id, name }) => ({ provider, id, name }));
  }

  async login(controllerId: string, providerId: string, type: AuthType = "oauth"): Promise<{ started: true }> {
    if (this.#attempt) throw new Error("login_in_progress");
    if (!this.advertised.includes(providerId) || providerId === "bedrock") throw new Error("provider_not_available");
    const abort = new AbortController();
    const attempt: LoginAttempt = { controllerId, providerId, abort };
    this.#attempt = attempt;
    void (await this.#runtime).login(providerId, type, {
      signal: abort.signal,
      notify: (event) => this.events.emit("auth", { type: event.type, data: event }),
      prompt: (prompt) => this.#prompt(attempt, prompt),
    }).then(
      () => this.events.emit("auth", { type: "complete", data: { providerId } }),
      (error: unknown) => this.events.emit("auth", { type: "error", data: { providerId, message: safeMessage(error) } }),
    ).finally(() => { if (this.#attempt === attempt) this.#attempt = undefined; });
    return { started: true };
  }

  #prompt(attempt: LoginAttempt, prompt: AuthPrompt): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      attempt.prompt = { id, resolve, reject };
      this.events.emit("auth", { type: prompt.type, data: { ...prompt, id, signal: undefined } });
    });
  }

  respond(id: string, value: string): void {
    const pending = this.#attempt?.prompt;
    if (!pending || pending.id !== id) throw new Error("prompt_not_found");
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
    await (await this.#runtime).setRuntimeApiKey(providerId, apiKey);
  }
  async removeApiKey(providerId: string): Promise<void> { await (await this.#runtime).removeRuntimeApiKey(providerId); }
}
