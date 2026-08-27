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
  for (const directive of ["Type=exec", "User=sero-node", "Restart=always", "StateDirectoryMode=0700", "ProtectSystem=strict", "ProtectProc=invisible", "NoNewPrivileges=yes", "ProtectHome=yes", "CapabilityBoundingSet=", "ReadWritePaths="]) expect(unit).toContain(directive);
  expect(unit.split("\n").some((line) => line.trim() === "MemoryDenyWriteExecute=yes")).toBe(false);
  expect(unit).not.toContain("DynamicUser=");
});

test("HTTP server bounds request bodies and non-streaming idle time", async () => {
  const server = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  expect(server).toContain("maxRequestBodySize: MAX_REQUEST_BODY_SIZE");
  expect(server).toContain("idleTimeout: 30");
  expect(server).toContain('server.timeout(request, 0)');
});

test("optional NVIDIA access keeps the device policy closed", async () => {
  const override = await readFile(new URL("../systemd/sero-node-nvidia.conf", import.meta.url), "utf8");
  expect(override).toContain("PrivateDevices=no");
  expect(override).toContain("DevicePolicy=closed");
  expect(override).toContain("DeviceAllow=char-nvidia* rw");
  expect(override).not.toContain("DevicePolicy=auto");
});

test("package pins Bun and produces the declared binary", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const workspace = await readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8");
  expect(packageJson.bin["sero-node"]).toBe("dist/sero-node");
  expect(packageJson.scripts.build).toBe("pnpm run build:linux:x64");
  expect(packageJson.scripts["build:linux:x64"]).toContain("--target=bun-linux-x64-baseline");
  expect(packageJson.scripts["build:linux:x64"]).toContain("--outfile=dist/sero-node");
  expect(packageJson.scripts["build:linux:arm64"]).toContain("--target=bun-linux-arm64");
  expect(packageJson.devDependencies.bun).toBe("catalog:");
  expect(workspace).toContain('bun: "1.2.18"');
  expect(workspace).toContain('"@types/bun": "1.2.18"');
});

test("operator documentation follows the fixed trust and control boundaries", async () => {
  const docs = await readFile(new URL("../../docs-site/docs/reference/agent-node-operations.md", import.meta.url), "utf8");
  const troubleshooting = await readFile(new URL("../../docs-site/docs/reference/agent-node-troubleshooting.md", import.meta.url), "utf8");
  expect(docs).toContain("sero-node.service");
  expect(docs).toContain("Never back up `identity.key`");
  expect(docs).toContain("Any active controller can answer or cancel");
  expect(docs).toContain("does not call `ListTasks`");
  expect(docs).toContain("`sero-node rotate-tls`");
  expect(docs).toContain("CLI-only operator action");
  expect(docs).toContain("Keep `ProtectHome=yes`");
  expect(docs).not.toContain("sero-agent-node.service");
  expect(troubleshooting).toContain("DevicePolicy=closed");
  expect(troubleshooting).toContain("Do not set `DevicePolicy=auto`");
  expect(troubleshooting).toContain("Docker access gives the agent effective root access");
});

test("hover-only node actions are also visible to keyboard focus", async () => {
  const tree = await readFile(new URL("../../desktop/src/components/layout/nodes/NodesTree.tsx", import.meta.url), "utf8");
  const hiddenActions = tree.match(/opacity-0 group-hover:opacity-100[^\"]*/g) ?? [];
  expect(hiddenActions.length).toBeGreaterThan(0);
  for (const classes of hiddenActions) expect(classes).toContain("focus-visible:opacity-100");
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
