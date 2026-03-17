/**
 * State file I/O helpers for the research extension.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ResearchState, ResearchSession, ResearchAgent } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

const STATE_REL_PATH = path.join('.sero', 'apps', 'research', 'state.json');

export function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

export async function readState(filePath: string): Promise<ResearchState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ResearchState;
  } catch {
    return { ...DEFAULT_STATE, history: [] };
  }
}

export async function writeState(filePath: string, state: ResearchState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Count lines in a file. Returns 0 if the file doesn't exist.
 */
export async function countLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * Read file contents. Returns empty string if the file doesn't exist.
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Create a directory and write initial skeleton content to a file.
 */
export async function writeSkeletonFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

// ── State reconciliation ────────────────────────────────────
//
// On app/session restart the subagents that were driving research are gone,
// but the state file may still say phase='researching' with agents 'running'.
// reconcileState checks the actual output files on disk to bring the
// persisted state back in line with reality.

/**
 * Reconcile persisted research state with the actual files on disk.
 * Call on session_start / session_switch so stale "running" sessions
 * are correctly finalized or marked as incomplete.
 *
 * Returns true if the state was modified (caller should persist).
 */
export async function reconcileState(
  state: ResearchState,
  workspaceCwd: string,
): Promise<boolean> {
  const session = state.current;
  if (!session) return false;

  const { phase } = session;

  // Nothing to reconcile for sessions that haven't started yet
  if (phase === 'idle' || phase === 'planning' || phase === 'awaiting_approval') {
    return false;
  }

  // Already finalized — shouldn't still be in `current`, move to history
  if (phase === 'complete' || phase === 'failed') {
    moveToHistory(state, session);
    return true;
  }

  // Phase is 'researching' or 'synthesizing' — check files on disk
  let changed = false;

  // Reconcile each agent's status from its output file
  for (const agent of session.agents) {
    if (agent.status === 'running' || agent.status === 'stuck' || agent.status === 'pending') {
      const updated = await reconcileAgent(agent, workspaceCwd);
      if (updated) changed = true;
    }
  }

  // Check if all agents are actually complete now
  const allAgentsDone = session.agents.every(
    (a) => a.status === 'complete' || a.status === 'failed',
  );

  if (phase === 'researching' && allAgentsDone) {
    // Check if synthesis also exists and is complete
    const synthPath = path.join(workspaceCwd, session.outputDir, 'synthesis.md');
    const synthContent = await readFile(synthPath);

    if (synthContent.includes('Status: COMPLETE')) {
      // Fully done — finalize
      session.phase = 'complete';
      session.completedAt = session.completedAt || new Date().toISOString();
      session.synthesisFile = path.join(session.outputDir, 'synthesis.md');
      moveToHistory(state, session);
      return true;
    }

    // Agents done but no synthesis yet — advance to synthesizing so the
    // agent can pick up synthesis on the next status check
    session.phase = 'synthesizing';
    changed = true;
  }

  if (phase === 'synthesizing') {
    const synthPath = path.join(workspaceCwd, session.outputDir, 'synthesis.md');
    const synthContent = await readFile(synthPath);

    if (synthContent.includes('Status: COMPLETE')) {
      session.phase = 'complete';
      session.completedAt = session.completedAt || new Date().toISOString();
      session.synthesisFile = path.join(session.outputDir, 'synthesis.md');
      moveToHistory(state, session);
      return true;
    }
  }

  return changed;
}

/**
 * Check a single agent's output file and update its status accordingly.
 * Returns true if the status was changed.
 */
async function reconcileAgent(
  agent: ResearchAgent,
  workspaceCwd: string,
): Promise<boolean> {
  const filePath = path.join(workspaceCwd, agent.outputFile);
  const content = await readFile(filePath);

  if (content.includes('Status: COMPLETE')) {
    agent.status = 'complete';
    agent.completedAt = agent.completedAt || new Date().toISOString();
    agent.sections.forEach((s) => { s.completed = true; });
    agent.lineCount = content.split('\n').length;
    return true;
  }

  // File has substantial content but no COMPLETE marker — the agent was
  // interrupted mid-work. Mark as failed so the UI doesn't show a spinner
  // for a process that no longer exists.
  if (content.length > 0) {
    agent.lineCount = content.split('\n').length;

    // Only downgrade 'running'/'stuck' to 'failed' — already-complete
    // or already-failed agents are left alone.
    if (agent.status === 'running' || agent.status === 'stuck') {
      agent.status = 'failed';
      agent.error = 'Interrupted — agent was not running when the session resumed';
      return true;
    }
  }

  // Pending agent with no file content — leave as-is (never started)
  if (agent.status === 'pending') return false;

  // Running/stuck agent with empty file — mark failed (skeleton was created
  // but agent never wrote anything before the app closed)
  if (agent.status === 'running' || agent.status === 'stuck') {
    agent.status = 'failed';
    agent.error = 'Interrupted — agent was not running when the session resumed';
    return true;
  }

  return false;
}

/** Move the current session into history and clear `current`. */
function moveToHistory(state: ResearchState, session: ResearchSession): void {
  state.history.unshift({
    question: session.question,
    mode: session.mode,
    outputDir: session.outputDir,
    agentCount: session.agents.length,
    completedAt: session.completedAt || new Date().toISOString(),
  });
  state.current = null;
}
