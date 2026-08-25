#!/usr/bin/env bun
import { bootstrapProviders, restoreSandboxEnv } from "./bootstrap.ts";
import { createApp } from "./app.ts";
import { ControllerStore } from "./controllers.ts";
import { startServer } from "./server.ts";
import { ensureState, identityFingerprint, rotateTls } from "./state.ts";
import { safeMessage } from "./redact.ts";

restoreSandboxEnv();

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "serve";
  const root = option("--state", process.env.STATE_DIRECTORY ?? "/var/lib/sero-node");
  if (command === "enrol") {
    const paths = await ensureState(root);
    const result = await new ControllerStore(paths).mintCode();
    console.log(`Enrolment code: ${result.code}`);
    console.log(`Expires: ${result.expiresAt}`);
    console.log(`Identity fingerprint (SHA-256 SPKI): ${await identityFingerprint(paths)}`);
    console.log("Work you send this node runs with the node's credentials. A task that reads untrusted text can reach them.");
    return;
  }
  if (command === "rotate-tls") {
    const paths = await ensureState(root); const before = await identityFingerprint(paths);
    await rotateTls(paths); console.log(`TLS certificate rotated. Identity fingerprint: ${before}`); return;
  }
  if (command === "smoke") { const boot = await bootstrapProviders(root); console.log(JSON.stringify({ status: "ok", oauth: boot.oauthRegistered, providerCount: boot.providers.length, bedrock: boot.providers.includes("bedrock") || boot.providers.includes("amazon-bedrock") })); return; }
  if (command !== "serve") throw new Error(`unknown command: ${command}`);
  const host = option("--host", process.env.SERO_NODE_HOST ?? "0.0.0.0");
  const port = Number(option("--port", process.env.SERO_NODE_PORT ?? "7443"));
  const publicUrl = option("--public-url", process.env.SERO_NODE_URL ?? "");
  if (!publicUrl) throw new Error("SERO_NODE_URL or --public-url is required");
  const parsedPublicUrl = URL.parse(publicUrl);
  if (!parsedPublicUrl || parsedPublicUrl.protocol !== "https:" || parsedPublicUrl.pathname !== "/" || parsedPublicUrl.search || parsedPublicUrl.hash) {
    throw new Error("public URL must be an HTTPS origin");
  }
  const services = await createApp(root, parsedPublicUrl.origin);
  const server = await startServer(services, { host, port, publicUrl: parsedPublicUrl.origin, tls: process.env.SERO_NODE_INSECURE !== "1" });
  console.log(`sero-node ready on ${server.url.origin}`);
}

main().catch((error: unknown) => { console.error(safeMessage(error)); process.exitCode = 1; });
