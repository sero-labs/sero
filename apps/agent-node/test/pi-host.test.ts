import { describe, expect, test } from "bun:test";
import { gateToolPermission, type RunnerHooks } from "../src/pi-host.ts";

function hooks(approved: boolean, calls: string[]): RunnerHooks {
  return {
    onDelta: () => {}, artifact: async () => {},
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

  test("does not ask for permission for read-only tools", async () => {
    const calls: string[] = [];
    expect(await gateToolPermission({ type: "tool_call", toolCallId: crypto.randomUUID(), toolName: "read", input: { path: "x" } }, hooks(false, calls))).toEqual({});
    expect(calls).toEqual([]);
  });
});
