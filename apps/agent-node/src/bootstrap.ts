import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { readFileSync } from "node:fs";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

export function restoreSandboxEnv(): void {
  if (process.platform !== "linux" || Object.keys(process.env).length > 2) return;
  const file = Bun.file("/proc/self/environ");
  if (!file.size) return;
  const bytes = readFileSync("/proc/self/environ", "utf8");
  for (const item of bytes.split("\0")) {
    const at = item.indexOf("=");
    if (at > 0) process.env[item.slice(0, at)] = item.slice(at + 1);
  }
}

export interface BootstrapResult { providers: string[]; oauthRegistered: true }

export async function bootstrapProviders(stateRoot: string): Promise<BootstrapResult> {
  restoreSandboxEnv();
  registerBunOAuthFlows();
  const runtime = await ModelRuntime.create({ authPath: `${stateRoot}/auth.json`, modelsStorePath: `${stateRoot}/models.json`, refreshOnCreate: false });
  const providers = runtime.getProviders().filter((provider) => provider.id !== "amazon-bedrock" && provider.id !== "bedrock");
  const unloaded = providers.filter((provider) => typeof provider.stream !== "function" || provider.getModels().some((model) => !model.api));
  if (providers.length === 0 || unloaded.length > 0) throw new Error(`provider bootstrap failed: ${unloaded.map((item) => item.id).join(",")}`);
  return { providers: providers.map((provider) => provider.id), oauthRegistered: true };
}
