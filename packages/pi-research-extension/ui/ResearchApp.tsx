/**
 * ResearchApp — Sero web UI for the multi-agent research orchestrator.
 *
 * Shows research progress: active workstreams, section detail, and history.
 */

import { useState, useCallback, useContext } from 'react';
import { useAppState, useAgentPrompt } from '@sero-ai/app-runtime';
import { AppContext } from '@sero-ai/app-runtime';
import type { ResearchState, ResearchSession, ResearchAgent, AgentStatus } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { useResearchActivity, type AgentActivity } from './useResearchActivity';
import { AgentActivityPanel } from './AgentActivityPanel';
import { IdleView } from './IdleView';

// ── Styles ───────────────────────────────────────────────────

const CUSTOM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap');

  .rs-root {
    --rs-bg: #0f1117;
    --rs-bg-surface: #191b23;
    --rs-bg-elevated: #22252f;
    --rs-text: #e8e4df;
    --rs-muted: #8b8d97;
    --rs-dim: #5c5e6a;
    --rs-accent: #818cf8;
    --rs-accent-hover: #a5b4fc;
    --rs-accent-glow: rgba(129, 140, 248, 0.12);
    --rs-success: #34d399;
    --rs-warning: #fbbf24;
    --rs-danger: #f87171;
    --rs-border: rgba(255, 255, 255, 0.07);
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background: var(--rs-bg);
    color: var(--rs-text);
  }
  @supports (color: var(--bg-base)) {
    .rs-root {
      --rs-bg: var(--bg-base, #0f1117);
      --rs-bg-surface: var(--bg-surface, #191b23);
      --rs-bg-elevated: var(--bg-elevated, #22252f);
      --rs-text: var(--text-primary, #e8e4df);
      --rs-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .rs-card {
    background: var(--rs-bg-surface);
    border: 1px solid var(--rs-border);
    border-radius: 12px;
  }

  .rs-progress-bar { height: 3px; border-radius: 2px; background: var(--rs-bg-elevated); overflow: hidden; margin-top: 12px; }
  .rs-progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }

  .rs-agent-card { padding: 14px 16px; border-radius: 8px; transition: background 0.15s; margin-bottom: 2px; cursor: pointer; user-select: none; }
  .rs-agent-card:hover { background: var(--rs-bg-elevated); }

  .rs-section-list { padding: 0 16px 10px 56px; }
  .rs-section-item { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; color: var(--rs-muted); }
  .rs-section-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  .rs-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

  .rs-button { border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 500; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .rs-button:disabled { opacity: 0.35; cursor: default; }
  .rs-button.primary { background: var(--rs-accent); color: #fff; }
  .rs-button.primary:hover:not(:disabled) { background: var(--rs-accent-hover); box-shadow: 0 0 20px var(--rs-accent-glow); }
  .rs-button.secondary { background: var(--rs-bg-elevated); color: var(--rs-muted); }
  .rs-button.secondary:hover:not(:disabled) { color: var(--rs-text); }
  .rs-button.danger { background: rgba(248, 113, 113, 0.12); color: var(--rs-danger); }
  .rs-button.danger:hover:not(:disabled) { background: rgba(248, 113, 113, 0.2); }

  .rs-input { flex: 1; border: 1px solid var(--rs-border); border-radius: 8px; padding: 8px 14px; font-size: 14px; font-family: 'DM Sans', sans-serif; background: var(--rs-bg-elevated); color: var(--rs-text); outline: none; transition: border-color 0.15s; }
  .rs-input::placeholder { color: var(--rs-dim); }
  .rs-input:focus { border-color: var(--rs-accent); }

  .rs-empty-orb { width: 56px; height: 56px; border-radius: 50%; background: radial-gradient(circle at 40% 40%, var(--rs-accent) 0%, transparent 70%); opacity: 0.15; animation: rs-pulse 3s ease-in-out infinite; }
  @keyframes rs-pulse {
    0%, 100% { transform: scale(1); opacity: 0.15; }
    50% { transform: scale(1.1); opacity: 0.25; }
  }
  @keyframes rs-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .rs-animate-in { animation: rs-fade-in 0.3s ease-out both; }
  @keyframes rs-spin { to { transform: rotate(360deg); } }
  .rs-spinner { animation: rs-spin 0.8s linear infinite; }
`;

// ── Main Component ─────────────────────────────────────────

export function ResearchApp() {
  const [state, updateState] = useAppState<ResearchState>(DEFAULT_STATE);
  const prompt = useAgentPrompt();
  const ctx = useContext(AppContext);
  const workspaceId = ctx?.workspaceId ?? '';

  // Track live subagent activity for running research agents
  const agentActivity = useResearchActivity(
    state.current?.agents ?? [],
    workspaceId,
  );

  const startResearch = useCallback((question: string) => {
    prompt(`/research ${question}`);
  }, [prompt]);

  const analyzeArticle = useCallback((urls: string[], context: string) => {
    const urlsPart = urls.join(' ');
    const contextPart = context ? ` ${context}` : '';
    prompt(`/analyze ${urlsPart}${contextPart}`);
  }, [prompt]);

  const approveResearch = useCallback(() => {
    prompt(
      'Approve the research plan and begin. Call research(action: "approve") ' +
      'then follow the returned instructions to launch all agents in parallel using the subagent tool.',
    );
  }, [prompt]);

  const cancelResearch = useCallback(() => {
    // Immediate UI update — don't wait for agent to process
    updateState((prev) => {
      if (!prev.current) return prev;
      return {
        ...prev,
        history: [{
          question: prev.current.question,
          mode: prev.current.mode,
          outputDir: prev.current.outputDir,
          agentCount: prev.current.agents.length,
          completedAt: new Date().toISOString(),
        }, ...prev.history],
        current: null,
      };
    });
  }, [updateState]);

  const dismissResearch = useCallback(() => {
    updateState((prev) => {
      if (!prev.current) return prev;
      return {
        ...prev,
        history: [{
          question: prev.current.question,
          mode: prev.current.mode,
          outputDir: prev.current.outputDir,
          agentCount: prev.current.agents.length,
          completedAt: prev.current.completedAt || new Date().toISOString(),
        }, ...prev.history],
        current: null,
      };
    });
  }, [updateState]);

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="rs-root" style={{ display: 'flex', height: '100%', width: '100%', flexDirection: 'column', overflow: 'hidden', padding: 24 }}>
        <div className="rs-card" style={{ display: 'flex', flex: '1 1 0%', flexDirection: 'column', overflow: 'hidden' }}>
          {state.current ? (
            <ActiveResearch
              session={state.current}
              agentActivity={agentActivity}
              onApprove={approveResearch}
              onCancel={cancelResearch}
              onDismiss={dismissResearch}
            />
          ) : (
            <IdleView onStart={startResearch} onAnalyze={analyzeArticle} history={state.history} />
          )}
        </div>
      </div>
    </>
  );
}

// ── Active Research View ───────────────────────────────────

function ActiveResearch({ session, agentActivity, onApprove, onCancel, onDismiss }: {
  session: ResearchSession;
  agentActivity: Map<string, AgentActivity>;
  onApprove: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  // Count completions using effective status (live subagent data)
  const completed = session.agents.filter((a) =>
    deriveEffectiveStatus(a.status, agentActivity.get(a.name)) === 'complete',
  ).length;
  const total = session.agents.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <>
      <Header session={session} completed={completed} total={total} progress={progress} />
      <div style={{ flex: '1 1 0%', overflowY: 'auto', padding: '8px 20px' }}>
        <div className="rs-animate-in">
          {session.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} activity={agentActivity.get(agent.name)} />
          ))}
          {session.phase === 'synthesizing' && <SynthesisCard />}
        </div>
      </div>
      <ActionBar phase={session.phase} onApprove={onApprove} onCancel={onCancel} onDismiss={onDismiss} />
    </>
  );
}

// ── Header ─────────────────────────────────────────────────

function Header({ session, completed, total, progress }: {
  session: ResearchSession; completed: number; total: number; progress: number;
}) {
  return (
    <div style={{ flexShrink: 0, padding: '20px 20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--rs-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          {session.mode === 'article' ? 'Article Analysis' : 'Research'}
        </h1>
        <PhaseBadge phase={session.phase} />
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--rs-muted)', lineHeight: 1.4, maxWidth: 500 }}>
        {session.question}
      </p>
      <div className="rs-progress-bar">
        <div className="rs-progress-fill" style={{
          width: `${progress}%`,
          background: session.phase === 'complete' ? 'var(--rs-success)' : 'var(--rs-accent)',
        }} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--rs-muted)' }}>
        <span>
          <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--rs-accent)' }}>{completed}</strong>
          {' / '}{total} agents complete
        </span>
        {session.phase === 'researching' && (
          <span style={{ color: 'var(--rs-success)' }}>● Researching</span>
        )}
        {session.phase === 'synthesizing' && (
          <span style={{ color: 'var(--rs-warning)' }}>● Synthesizing</span>
        )}
        {session.phase === 'complete' && (
          <span style={{ color: 'var(--rs-success)' }}>✓ Complete</span>
        )}
      </div>
    </div>
  );
}

// ── Agent Card (expandable sections) ───────────────────────

function AgentCard({ agent, activity }: { agent: ResearchAgent; activity?: AgentActivity }) {
  const [expanded, setExpanded] = useState(false);

  // Derive effective status: prefer live subagent status over stale state file
  const effectiveStatus: AgentStatus = deriveEffectiveStatus(agent.status, activity);
  const isRunning = effectiveStatus === 'running';

  const icon = statusIconChar(effectiveStatus);
  const statusColor = statusColorVar(effectiveStatus);

  return (
    <div>
      <div className="rs-agent-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => setExpanded(!expanded)}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
          background: `${statusColor}18`,
          border: `1.5px solid ${statusColor}40`,
        }}>
          {isRunning ? <Spinner size={14} /> : icon}
        </div>
        <div style={{ flex: '1 1 0%', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--rs-text)' }}>
            Agent {agent.id}: {agent.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--rs-muted)', marginTop: 2 }}>
            {agent.sections.length} sections
            {agent.lineCount > 0 && ` · ${agent.lineCount} lines`}
            {effectiveStatus === 'stuck' && ' · ⚠️ Stuck'}
          </div>
        </div>
        <span className="rs-badge" style={{ background: `${statusColor}18`, color: statusColor }}>
          {effectiveStatus}
        </span>
        <Chevron expanded={expanded} />
      </div>

      {expanded && (
        <div className="rs-section-list">
          {isRunning ? (
            /* When running: show only the activity panel */
            activity ? (
              <AgentActivityPanel activity={activity} />
            ) : (
              <p style={{ fontSize: 11, color: 'var(--rs-dim)', padding: '4px 0', lineHeight: 1.4 }}>
                Waiting for agent to start…
              </p>
            )
          ) : (
            /* When not running: show sections */
            agent.sections.map((s, i) => (
              <div key={i} className="rs-section-item">
                <div className="rs-section-dot" style={{
                  background: s.completed ? 'var(--rs-success)' : 'var(--rs-dim)',
                }} />
                <span style={s.completed ? { color: 'var(--rs-success)' } : undefined}>
                  {s.title}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Synthesis Card ─────────────────────────────────────────

function SynthesisCard() {
  return (
    <div className="rs-agent-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1.5px solid rgba(251, 191, 36, 0.25)',
      }}>
        <Spinner size={14} />
      </div>
      <div style={{ flex: '1 1 0%' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--rs-text)' }}>Synthesis Agent</div>
        <div style={{ fontSize: 12, color: 'var(--rs-muted)', marginTop: 2 }}>
          Cross-cutting analysis in progress...
        </div>
      </div>
      <span className="rs-badge" style={{ background: 'rgba(251, 191, 36, 0.12)', color: 'var(--rs-warning)' }}>
        running
      </span>
    </div>
  );
}

// ── Phase Badge ────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    idle: { label: 'Idle', bg: 'var(--rs-bg-elevated)', color: 'var(--rs-dim)' },
    planning: { label: 'Planning', bg: 'rgba(129, 140, 248, 0.12)', color: 'var(--rs-accent)' },
    awaiting_approval: { label: 'Awaiting Approval', bg: 'rgba(251, 191, 36, 0.12)', color: 'var(--rs-warning)' },
    researching: { label: 'Researching', bg: 'rgba(52, 211, 153, 0.12)', color: 'var(--rs-success)' },
    synthesizing: { label: 'Synthesizing', bg: 'rgba(251, 191, 36, 0.12)', color: 'var(--rs-warning)' },
    complete: { label: '✓ Complete', bg: 'rgba(52, 211, 153, 0.12)', color: 'var(--rs-success)' },
    failed: { label: 'Failed', bg: 'rgba(248, 113, 113, 0.12)', color: 'var(--rs-danger)' },
  };
  const { label, bg, color } = config[phase] ?? config.idle!;
  return <span className="rs-badge" style={{ background: bg, color }}>{label}</span>;
}

// ── Action Bar ─────────────────────────────────────────────

function ActionBar({ phase, onApprove, onCancel, onDismiss }: {
  phase: string;
  onApprove: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderTop: '1px solid var(--rs-border)' }}>
      {phase === 'awaiting_approval' && (
        <>
          <button onClick={onApprove} className="rs-button primary">Approve &amp; Launch</button>
          <button onClick={onCancel} className="rs-button secondary">Cancel</button>
        </>
      )}
      {(phase === 'researching' || phase === 'synthesizing') && (
        <button onClick={onCancel} className="rs-button danger">Cancel Research</button>
      )}
      {(phase === 'complete' || phase === 'failed') && (
        <>
          {phase === 'complete' && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rs-success)', marginRight: 'auto' }}>
              ✓ Research complete — check the output files
            </span>
          )}
          {phase === 'failed' && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rs-danger)', marginRight: 'auto' }}>
              Research failed or was cancelled
            </span>
          )}
          <button onClick={onDismiss} className="rs-button secondary">Dismiss</button>
        </>
      )}
    </div>
  );
}

// ── Icons & Utils ──────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="rs-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="var(--rs-dim)" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function statusIconChar(status: AgentStatus): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'running': return '';
    case 'stuck': return '⚠️';
    case 'complete': return '✓';
    case 'failed': return '✗';
  }
}

function statusColorVar(status: AgentStatus): string {
  switch (status) {
    case 'pending': return 'var(--rs-dim)';
    case 'running': return 'var(--rs-accent)';
    case 'stuck': return 'var(--rs-warning)';
    case 'complete': return 'var(--rs-success)';
    case 'failed': return 'var(--rs-danger)';
  }
}

/**
 * Derive the effective agent status by combining the state file status
 * with live subagent activity. The state file only updates on explicit
 * status checks, so the subagent tracker is the source of truth for
 * whether an agent has actually completed.
 */
function deriveEffectiveStatus(
  stateStatus: AgentStatus,
  activity?: AgentActivity,
): AgentStatus {
  if (!activity) return stateStatus;

  // Map subagent statuses to research agent statuses
  if (activity.status === 'completed') return 'complete';
  if (activity.status === 'failed' || activity.status === 'timed_out') return 'failed';
  if (activity.status === 'aborted') return 'failed';
  if (activity.status === 'running' || activity.status === 'queued') return 'running';

  return stateStatus;
}

export default ResearchApp;
