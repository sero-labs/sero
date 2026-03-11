/**
 * Dispatch logic — candidate selection, sorting, and worker spawning.
 *
 * Extracted from orchestrator.ts to keep files under 500 LOC.
 */

import type { Issue, RunningEntry, SymphonyConfig } from '../shared/types';
import { createRunningEntry } from '../shared/types';
import { AgentRunner } from './agent-runner';
import type { AgentCallbacks, AgentResult } from './agent-runner';
import { buildPrompt } from './prompt-builder';
import { WorkspaceManager } from './workspace-manager';
import { info, warn, error as logError } from './logger';

// ── Types ──────────────────────────────────────────────────────

export interface DispatchCallbacks {
  onRunStarted: (entry: RunningEntry, runner: AgentRunner) => void;
  onRunFinished: (issueId: string, result: AgentResult) => void;
  onRunUpdate: (issueId: string, updates: Partial<RunningEntry>) => void;
}

// ── Candidate selection (Section 8.2) ──────────────────────────

export function selectCandidates(
  issues: Issue[],
  claimed: Set<string>,
  runningCount: number,
  config: SymphonyConfig,
): Issue[] {
  const maxSlots = config.agent.max_concurrent - runningCount;
  if (maxSlots <= 0) return [];

  const activeStates = new Set(config.tracker.active_states);

  const eligible = issues.filter((issue) => {
    // Not already claimed
    if (claimed.has(issue.id)) return false;
    // Must be in active state
    if (!activeStates.has(issue.state)) return false;
    // Blocker check: skip if any blocker is not in terminal state
    const terminalStates = new Set(config.tracker.terminal_states);
    if (issue.blockedBy.length > 0) {
      const hasActiveBlocker = issue.blockedBy.some(
        (b) => b.state && !terminalStates.has(b.state),
      );
      if (hasActiveBlocker) return false;
    }
    return true;
  });

  // Sort: priority asc → createdAt oldest → identifier lexicographic
  eligible.sort((a, b) => {
    const pa = a.priority ?? 999;
    const pb = b.priority ?? 999;
    if (pa !== pb) return pa - pb;

    const ca = a.createdAt ?? '';
    const cb = b.createdAt ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;

    return a.identifier.localeCompare(b.identifier);
  });

  return eligible.slice(0, maxSlots);
}

// ── Worker dispatch ────────────────────────────────────────────

export async function dispatchWorker(
  issue: Issue,
  promptTemplate: string,
  config: SymphonyConfig,
  workspaceManager: WorkspaceManager,
  callbacks: DispatchCallbacks,
  attempt: number,
): Promise<void> {
  const entry = createRunningEntry(issue, attempt > 0 ? attempt : null);

  info('dispatch:starting', {
    issueId: issue.id,
    identifier: issue.identifier,
    attempt,
  });

  // Create workspace
  let workspacePath: string;
  try {
    workspacePath = await workspaceManager.createForIssue(issue.identifier);
  } catch (err) {
    logError('dispatch:workspace-failed', {
      issueId: issue.id,
      error: err instanceof Error ? err.message : String(err),
    });
    callbacks.onRunFinished(issue.id, {
      success: false,
      turnCount: 0,
      error: 'workspace_creation_failed',
      needsContinuation: false,
    });
    return;
  }

  // Build prompt
  entry.phase = 'building_prompt';
  const prompt = buildPrompt(promptTemplate, issue, attempt, 1);

  // Create agent runner
  const runner = new AgentRunner(config.session);

  // Notify orchestrator about new run
  callbacks.onRunStarted(entry, runner);

  // Agent callbacks
  const agentCallbacks: AgentCallbacks = {
    onPhaseChange: (phase) => {
      callbacks.onRunUpdate(issue.id, { phase });
    },
    onTokenUpdate: (usage) => {
      callbacks.onRunUpdate(issue.id, {
        agentInputTokens: usage.inputTokens,
        agentOutputTokens: usage.outputTokens,
        agentTotalTokens: usage.totalTokens,
      });
    },
    onMessage: (message) => {
      callbacks.onRunUpdate(issue.id, { lastAgentMessage: message });
    },
    onEvent: (event, timestamp) => {
      callbacks.onRunUpdate(issue.id, {
        lastAgentEvent: event,
        lastAgentTimestamp: timestamp,
      });
    },
    onSessionStarted: (sessionId) => {
      callbacks.onRunUpdate(issue.id, { sessionId });
    },
    onTurnComplete: (turnNumber, _result) => {
      callbacks.onRunUpdate(issue.id, { turnCount: turnNumber });
    },
  };

  // Run agent (async — don't await, let it run in background)
  runner
    .run(prompt, workspacePath, agentCallbacks, 0)
    .then((result) => {
      callbacks.onRunFinished(issue.id, result);
    })
    .catch((err) => {
      logError('dispatch:agent-error', {
        issueId: issue.id,
        error: err instanceof Error ? err.message : String(err),
      });
      callbacks.onRunFinished(issue.id, {
        success: false,
        turnCount: 0,
        error: err instanceof Error ? err.message : String(err),
        needsContinuation: false,
      });
    });
}
