// The shared live block, and the watch it holds while it is shown.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LiveBlock } from "../live-block";
import {
  formatElapsed,
  openSubagentLiveWatch,
  type SubagentLiveBridge,
  type SubagentLiveEvent,
} from "../live-watch";

/** A bridge that records calls and lets a test push events by hand. */
function fakeBridge() {
  let listener: ((event: SubagentLiveEvent) => void) | null = null;
  const bridge: SubagentLiveBridge = {
    watch: vi.fn(async () => {}),
    unwatch: vi.fn(async () => {}),
    onEvent: (callback) => {
      listener = callback;
      return () => {
        listener = null;
      };
    },
  };
  return {
    bridge,
    emit: (event: SubagentLiveEvent) => listener?.(event),
    isListening: () => listener !== null,
  };
}

describe("formatElapsed", () => {
  it("shows minutes and seconds, and hours past an hour", () => {
    expect(formatElapsed(4_000)).toBe("0:04");
    expect(formatElapsed(47_000)).toBe("0:47");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

describe("LiveBlock", () => {
  const startedAt = Date.now() - 4_000;

  it("names the running tool with its argument and elapsed time, then the text", () => {
    const html = renderToStaticMarkup(
      <LiveBlock
        activity={{ toolName: "edit", argsSummary: "src/components/LibraryFilters.tsx" }}
        text="The status filter already derives its list."
        startedAt={startedAt}
      />,
    );

    expect(html).toContain("edit src/components/LibraryFilters.tsx");
    expect(html).toContain("0:04");
    expect(html).toContain("The status filter already derives its list.");
  });

  it("says it is writing its answer when no tool runs", () => {
    const html = renderToStaticMarkup(<LiveBlock text="Thinking." startedAt={startedAt} />);

    expect(html).toContain("writing its answer");
    expect(html).toContain("Thinking.");
  });

  it("shows a quiet line in place of the tool line", () => {
    const html = renderToStaticMarkup(
      <LiveBlock quietLabel="checking the result" text='{"status": "succeeded"}' startedAt={startedAt} />,
    );

    expect(html).toContain("checking the result");
    expect(html).not.toContain("writing its answer");
  });

  it("names the agent only when told to", () => {
    const withName = renderToStaticMarkup(
      <LiveBlock agentName="scout" text="Scanning." startedAt={startedAt} />,
    );
    const withoutName = renderToStaticMarkup(<LiveBlock text="Scanning." startedAt={startedAt} />);

    expect(withName).toContain("scout");
    expect(withoutName).not.toContain("scout");
  });

  it("uses a fixed-width face for a raw reply", () => {
    const html = renderToStaticMarkup(
      <LiveBlock monospace text='{"title": "Milestone 6"}' startedAt={startedAt} />,
    );

    expect(html).toContain("font-mono");
    expect(html).toContain("break-all");
  });

  it("shows the live caret only while the agent is live", () => {
    const live = renderToStaticMarkup(<LiveBlock text="Working." startedAt={startedAt} />);
    const dimmed = renderToStaticMarkup(<LiveBlock text="Done." live={false} startedAt={startedAt} />);

    expect(live).toContain("animate-pulse");
    expect(dimmed).not.toContain("animate-pulse");
  });
});

describe("openSubagentLiveWatch", () => {
  it("opens one watch and closes it", () => {
    const { bridge } = fakeBridge();
    const close = openSubagentLiveWatch(bridge, "run-1", () => {});

    expect(bridge.watch).toHaveBeenCalledWith("run-1");
    close();
    expect(bridge.unwatch).toHaveBeenCalledWith("run-1");
  });

  it("reports the running tool and the text it wrote", () => {
    const { bridge, emit } = fakeBridge();
    const snapshots: Array<{ text: string; toolName: string | null }> = [];
    openSubagentLiveWatch(bridge, "run-1", (snapshot) => {
      snapshots.push({ text: snapshot.text, toolName: snapshot.tool?.toolName ?? null });
    });

    emit({ type: "subagent_live_output", id: "run-1", text: "reading files" });
    emit({
      type: "subagent_tool_activity",
      id: "run-1",
      activity: [{ toolName: "edit", argsSummary: "src/App.tsx", running: true }],
    });

    expect(snapshots.at(-1)).toEqual({ text: "reading files", toolName: "edit" });
  });

  it("ignores an event for another run", () => {
    const { bridge, emit } = fakeBridge();
    const onSnapshot = vi.fn();
    openSubagentLiveWatch(bridge, "run-1", onSnapshot);

    emit({ type: "subagent_live_output", id: "run-2", text: "not mine" });

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("delivers nothing after the block closes", () => {
    const { bridge, emit, isListening } = fakeBridge();
    const onSnapshot = vi.fn();

    const close = openSubagentLiveWatch(bridge, "run-1", onSnapshot);
    emit({ type: "subagent_live_output", id: "run-1", text: "while open" });
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    close();

    expect(isListening()).toBe(false);
    emit({ type: "subagent_live_output", id: "run-1", text: "after close" });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });
});
