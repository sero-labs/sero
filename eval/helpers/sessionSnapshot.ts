/**
 * Session snapshot helper — captures system prompt, tool list, and
 * resource loader state from a headless agent session.
 *
 * Used by prompt-caching eval scenarios to detect unintentional changes
 * to the system prompt or tool ordering across releases.
 *
 * The snapshot is returned as structured metadata so assertions can
 * compare against a known-good baseline.
 */

interface SessionSnapshot {
  /** The full system prompt (after all extensions run) */
  systemPrompt: string;
  /** Ordered list of tool names as seen by the model */
  toolNames: string[];
  /** Tool names + descriptions for richer comparison */
  tools: Array<{ name: string; description: string }>;
  /** SHA-256 hash of systemPrompt for quick equality check */
  systemPromptHash: string;
  /** SHA-256 hash of the sorted tool name list */
  toolListHash: string;
  /** Number of system prompt characters (for cache-size tracking) */
  systemPromptLength: number;
}

/**
 * Capture a snapshot of the session's system prompt and tool list.
 *
 * Call this AFTER createAgentSession() returns but BEFORE sending
 * any prompts, to get the initial state that the model sees.
 */
export function captureSessionSnapshot(session: any): SessionSnapshot {
  const state = session.agent?.state ?? session.state ?? {};
  const systemPrompt: string = state.systemPrompt ?? '';
  const tools: Array<{ name: string; description: string }> =
    (state.tools ?? []).map((t: any) => ({
      name: t.name ?? '',
      description: t.description ?? '',
    }));
  const toolNames = tools.map((t) => t.name);

  return {
    systemPrompt,
    toolNames,
    tools,
    systemPromptHash: hashString(systemPrompt),
    toolListHash: hashString(toolNames.slice().sort().join('\n')),
    systemPromptLength: systemPrompt.length,
  };
}

/**
 * Compare two snapshots and return a structured diff result.
 */
export function diffSnapshots(
  baseline: SessionSnapshot,
  current: SessionSnapshot,
): {
  promptChanged: boolean;
  toolsChanged: boolean;
  addedTools: string[];
  removedTools: string[];
  reorderedTools: boolean;
  promptLengthDelta: number;
} {
  const baseSet = new Set(baseline.toolNames);
  const currSet = new Set(current.toolNames);
  const addedTools = current.toolNames.filter((t) => !baseSet.has(t));
  const removedTools = baseline.toolNames.filter((t) => !currSet.has(t));

  // Check if tools that exist in both lists changed order
  const commonInBaseline = baseline.toolNames.filter((t) => currSet.has(t));
  const commonInCurrent = current.toolNames.filter((t) => baseSet.has(t));
  const reorderedTools =
    commonInBaseline.length > 0 &&
    commonInBaseline.join(',') !== commonInCurrent.join(',');

  return {
    promptChanged: baseline.systemPromptHash !== current.systemPromptHash,
    toolsChanged: baseline.toolListHash !== current.toolListHash,
    addedTools,
    removedTools,
    reorderedTools,
    promptLengthDelta:
      current.systemPromptLength - baseline.systemPromptLength,
  };
}

/** Simple string hash using Node's crypto (sync). */
function hashString(input: string): string {
  // Use dynamic require to avoid ESM issues in promptfoo's tsx loader
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(input).digest('hex');
}
