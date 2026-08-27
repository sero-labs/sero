import { describe, expect, test } from "bun:test";
import type { ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gateToolPermission, prepareToolCall, type RunnerHooks } from "../src/pi-host.ts";

function hooks(approved: boolean, calls: string[]): RunnerHooks {
  return {
    onEvent: () => {}, artifact: async () => {},
    approve: async (toolName) => { calls.push(toolName); return approved; },
  };
}

describe("Pi tool permission gate", () => {
  test("blocks write, edit, and bash unless the node-owned approval resolves true", async () => {
    for (const toolName of ["write", "edit", "bash"] as const) {
      const calls: string[] = [];
      expect(await gateToolPermission({ type: "tool_call", toolCallId: crypto.randomUUID(), toolName, input: {} }, hooks(false, calls)))
        .toMatchObject({ block: true, terminate: true });
      expect(calls).toEqual([toolName]);
      expect(await gateToolPermission({ type: "tool_call", toolCallId: crypto.randomUUID(), toolName, input: {} }, hooks(true, calls))).toEqual({});
    }
  });

  test("confines read-only tools to the session workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "sero-tool-gate-"));
    try {
      const workspace = join(root, "workspace");
      const secret = join(root, "secret.txt");
      await mkdir(workspace);
      await writeFile(join(workspace, "safe.txt"), "safe");
      await writeFile(secret, "secret");
      await symlink(secret, join(workspace, "escaped.txt"));
      const calls: string[] = [];
      const event = (toolName: string, path?: string): ToolCallEvent => ({
        type: "tool_call", toolCallId: crypto.randomUUID(), toolName, input: path === undefined ? {} : { path },
      });

      expect(await gateToolPermission(event("read", "safe.txt"), hooks(false, calls), workspace)).toEqual({});
      expect(await gateToolPermission(event("read", "missing.txt"), hooks(false, calls), workspace)).toEqual({});
      expect(await gateToolPermission(event("grep"), hooks(false, calls), workspace)).toEqual({});
      expect(await gateToolPermission(event("read", pathToFileURL(join(workspace, "safe.txt")).href), hooks(false, calls), workspace)).toEqual({});
      expect(await gateToolPermission(event("read", secret), hooks(false, calls), workspace)).toMatchObject({ block: true });
      expect(await gateToolPermission(event("read", `@${secret}`), hooks(false, calls), workspace)).toMatchObject({ block: true });
      expect(await gateToolPermission(event("read", pathToFileURL(secret).href), hooks(false, calls), workspace)).toMatchObject({ block: true });
      expect(await gateToolPermission(event("read", "~/outside"), hooks(false, calls), workspace)).toMatchObject({ block: true });
      expect(await gateToolPermission(event("read", "escaped.txt"), hooks(false, calls), workspace)).toMatchObject({ block: true });
      expect(calls).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps remote shell commands alive until completion or cancellation", async () => {
    const event: ToolCallEvent = { type: "tool_call", toolCallId: crypto.randomUUID(), toolName: "bash", input: { command: "docker pull image", timeout: 1800 } };
    await prepareToolCall(event, hooks(true, []));
    expect(event.input).toEqual({ command: "docker pull image" });
  });
});
