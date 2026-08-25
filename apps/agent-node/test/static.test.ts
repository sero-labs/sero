import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { redact } from "../src/redact.ts";
import { bootstrapProviders } from "../src/bootstrap.ts";
import { temporaryState } from "./helpers.ts";

test("redacts credential-bearing fields and bearer values", () => {
  expect(redact({ apiKey: "secret", nested: { authorization: "Bearer abc.def", safe: "ok" } })).toEqual({ apiKey: "[REDACTED]", nested: { authorization: "[REDACTED]", safe: "ok" } });
});

test("systemd unit has the required account and hardening without W^X denial", async () => {
  const unit = await readFile(new URL("../systemd/sero-node.service", import.meta.url), "utf8");
  for (const directive of ["User=sero-node", "StateDirectoryMode=0700", "ProtectSystem=strict", "ProtectProc=invisible", "NoNewPrivileges=yes", "ProtectHome=yes", "CapabilityBoundingSet=", "ReadWritePaths="]) expect(unit).toContain(directive);
  expect(unit.split("\n").some((line) => line.trim() === "MemoryDenyWriteExecute=yes")).toBe(false);
  expect(unit).not.toContain("DynamicUser=");
});

test("registers OAuth and advertises only providers with bundled APIs, excluding Bedrock", async () => {
  const temp = await temporaryState();
  try {
    const result = await bootstrapProviders(temp.root);
    expect(result.oauthRegistered).toBe(true);
    expect(result.providers.length).toBeGreaterThan(5);
    expect(result.providers).not.toContain("bedrock");
    expect(result.providers).not.toContain("amazon-bedrock");
  } finally { await temp.cleanup(); }
});
