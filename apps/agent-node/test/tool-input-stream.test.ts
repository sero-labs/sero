import { describe, expect, test } from "bun:test";
import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";
import { ToolInputStreams } from "../src/tool-input-stream.ts";

function message(argumentsValue: Record<string, unknown>): AssistantMessage {
  return {
    content: [{ type: "toolCall", id: "", name: "write", arguments: argumentsValue }],
  } as AssistantMessage;
}

function toolCall(argumentsValue: Record<string, unknown>): ToolCall {
  return { type: "toolCall", id: "call-1", name: "write", arguments: argumentsValue };
}

describe("remote tool input streaming", () => {
  test("emits incremental file content and reconciles the final tool call id", () => {
    const streams = new ToolInputStreams();
    const started = streams.start(message({}), 0);
    const first = streams.advance(message({ path: "/src/app.ts", content: "line one" }), 0);
    const second = streams.advance(message({ path: "/src/app.ts", content: "line one\nline two" }), 0);
    const finished = streams.end(toolCall({ path: "/src/app.ts", content: "line one\nline two\n" }), 0);

    expect(started).toMatchObject({ toolName: "write" });
    expect(first).toMatchObject({ delta: "line one", path: "/src/app.ts", replace: false });
    expect(second).toMatchObject({ delta: "\nline two", replace: false });
    expect(finished).toMatchObject({
      streamKey: started?.streamKey,
      toolCallId: "call-1",
      final: { delta: "\n", replace: false },
    });
  });
});
