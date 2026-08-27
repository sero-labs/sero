import { describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { EventHub } from "../src/events.ts";
import { ProviderAuth } from "../src/provider-auth.ts";
import { ensureState } from "../src/state.ts";
import { temporaryState } from "./helpers.ts";

describe("provider credential persistence", () => {
  test("stores API keys in Pi auth.json and resolves them after restart", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root);
      const first = new ProviderAuth(paths, new EventHub(), ["anthropic"]);
      await first.setApiKey("anthropic", "restart-secret");

      const stored = JSON.parse(await readFile(`${paths.root}/auth.json`, "utf8")) as Record<string, unknown>;
      expect(stored).toEqual({ anthropic: { type: "api_key", key: "restart-secret" } });
      expect((await stat(`${paths.root}/auth.json`)).mode & 0o777).toBe(0o600);

      const restarted = new ProviderAuth(paths, new EventHub(), ["anthropic"]);
      expect((await restarted.providers()).apiKey).toContainEqual({
        id: "anthropic", name: "Anthropic", hasKey: true, fromEnv: false,
      });
      await restarted.removeApiKey("anthropic");
      expect(JSON.parse(await readFile(`${paths.root}/auth.json`, "utf8"))).toEqual({});
    } finally { await temp.cleanup(); }
  });
});
