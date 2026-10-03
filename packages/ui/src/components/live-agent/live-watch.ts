/**
 * Live watch wiring for a running agent.
 *
 * Kept separate from the component so the rules are testable without a
 * renderer: one watch per visible block, opened on show and closed on hide,
 * and nothing delivered after it closes.
 */

/** Minimal view of the shell's subagent events, as a live block needs them. */
export interface SubagentLiveEvent {
  type: string;
  id?: string;
  text?: string;
  /** True when the newest live text is the model's reasoning. */
  reasoning?: boolean;
  activity?: Array<{ toolName: string; argsSummary: string; running: boolean }>;
}

/**
 * Minimal view of the shell's subagent bridge.
 *
 * Structural, so `window.sero.subagent` fits without the UI package depending
 * on the desktop app's types.
 */
export interface SubagentLiveBridge {
  watch(runId: string): Promise<void>;
  unwatch(runId: string): Promise<void>;
  onEvent(callback: (event: SubagentLiveEvent) => void): () => void;
}

/** What a live block needs for the line it shows now. */
export interface LiveAgentSnapshot {
  /** Text the agent wrote, newest last. */
  text: string;
  /** True when the newest text is the model's reasoning, not its answer. */
  reasoning?: boolean;
  /** The tool running now, or null while no tool runs. */
  tool: { toolName: string; argsSummary: string } | null;
  /** When the current line started, for the elapsed timer. */
  startedAt: number;
}

/**
 * The shell's subagent bridge, when the host has one.
 *
 * An older host has no watch, and the block then shows no live text.
 */
export function getSubagentLiveBridge(): SubagentLiveBridge | null {
  const shell = globalThis as { sero?: { subagent?: unknown } };
  const subagent = shell.sero?.subagent;
  if (!subagent || typeof subagent !== 'object') return null;

  const candidate = subagent as Partial<SubagentLiveBridge>;
  if (
    typeof candidate.watch !== 'function'
    || typeof candidate.unwatch !== 'function'
    || typeof candidate.onEvent !== 'function'
  ) {
    return null;
  }
  return candidate as SubagentLiveBridge;
}

/** The running tool, given a tool-activity payload. */
function runningTool(
  activity: SubagentLiveEvent['activity'],
): { toolName: string; argsSummary: string } | null {
  const running = (activity ?? []).filter((item) => item.running);
  const last = running.at(-1);
  return last ? { toolName: last.toolName, argsSummary: last.argsSummary } : null;
}

function sameTool(
  a: { toolName: string; argsSummary: string } | null,
  b: { toolName: string; argsSummary: string } | null,
): boolean {
  if (!a || !b) return a === b;
  return a.toolName === b.toolName && a.argsSummary === b.argsSummary;
}

/**
 * Show one run and hold a watch on it until `close` is called.
 *
 * Opening the watch makes the host send where the run is now; text sent while
 * nothing watched is not replayed.
 */
export function openSubagentLiveWatch(
  bridge: SubagentLiveBridge,
  runId: string,
  onSnapshot: (snapshot: LiveAgentSnapshot) => void,
): () => void {
  let text = '';
  let reasoning = false;
  let tool: LiveAgentSnapshot['tool'] = null;
  let startedAt = Date.now();
  let closed = false;

  const unsubscribe = bridge.onEvent((event) => {
    if (closed || event.id !== runId) return;

    if (event.type === 'subagent_tool_activity') {
      const next = runningTool(event.activity);
      // The timer measures the current line, so a new tool restarts it. A
      // repeat of the same tool keeps the time it already has.
      if (!sameTool(next, tool)) startedAt = Date.now();
      tool = next;
    } else if (event.type === 'subagent_live_output') {
      text = event.text ?? '';
      reasoning = event.reasoning === true;
    } else {
      return;
    }

    onSnapshot({ text, tool, startedAt, ...(reasoning ? { reasoning } : {}) });
  });

  void bridge.watch(runId);

  return () => {
    closed = true;
    unsubscribe();
    void bridge.unwatch(runId);
  };
}

/** `0:07`, or `1:02:03` past an hour. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = `${minutes}`.padStart(2, '0');
  const ss = `${seconds}`.padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}
