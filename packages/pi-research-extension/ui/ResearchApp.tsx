/**
 * ResearchApp — Sero web UI for the multi-agent research orchestrator.
 *
 * Shows research progress: active workstreams, line counts, status, and history.
 */

import { useCallback, useMemo } from 'react';
import { useAppState, useAgentPrompt } from '@sero/app-runtime';
import type { ResearchState, ResearchSession, ResearchAgent, AgentStatus } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

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

  .rs-agent-card { padding: 14px 16px; border-radius: 8px; transition: background 0.15s; margin-bottom: 2px; }
  .rs-agent-card:hover { background: var(--rs-bg-elevated); }

  .rs-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

  .rs-button { border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 500; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .rs-button:disabled { opacity: 0.35; cursor: default; }
  .rs-button.primary { background: var(--rs-accent); color: #fff; }
  .rs-button.primary:hover:not(:disabled) { background: var(--rs-accent-hover); box-shadow: 0 0 20px var(--rs-accent-glow); }
  .rs-button.secondary { background: var(--rs-bg-elevated); color: var(--rs-muted); }
  .rs-button.secondary:hover:not(:disabled) { color: var(--rs-text); }

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
  const [state] = useAppState<ResearchState>(DEFAULT_STATE);
  const prompt = useAgentPrompt();

  const startResearch = useCallback(() => {
    prompt('/research');
  }, [prompt]);

  const checkStatus = useCallback(() => {
    prompt('Check the status of the current research using the research tool with action "status".');
  }, [prompt]);

  const cancelResearch = useCallback(() => {
    prompt('Cancel the current research using the research tool with action "cancel".');
  }, [prompt]);

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="rs-root" style={{ display: 'flex', height: '100%', width: '100%', flexDirection: 'column', overflow: 'hidden', padding: 24 }}>
        <div className="rs-card" style={{ display: 'flex', flex: '1 1 0%', flexDirection: 'column', overflow: 'hidden' }}>
          {state.current ? (
            <ActiveResearch session={state.current} onCheckStatus={checkStatus} onCancel={cancelResearch} />
          ) : (
            <IdleView onStart={startResearch} history={state.history} />
          )}
        </div>
      </div>
    </>
  );
}

// ── Active Research View ───────────────────────────────────

function ActiveResearch({ session, onCheckStatus, onCancel }: {
  session: ResearchSession;
  onCheckStatus: () => void;
  onCancel: () => void;
}) {
  const completed = session.agents.filter((a) => a.status === 'complete').length;
  const total = session.agents.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <>
      <Header session={session} completed={completed} total={total} progress={progress} />
      <div style={{ flex: '1 1 0%', overflowY: 'auto', padding: '8px 20px' }}>
        <div className="rs-animate-in">
          {session.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
          {session.phase === 'synthesizing' && <SynthesisCard />}
        </div>
      </div>
      <ActionBar phase={session.phase} onCheckStatus={onCheckStatus} onCancel={onCancel} />
    </>
  );
}

function Header({ session, completed, total, progress }: {
  session: ResearchSession; completed: number; total: number; progress: number;
}) {
  return (
    <div style={{ flexShrink: 0, padding: '20px 20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--rs-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Research
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

function AgentCard({ agent }: { agent: ResearchAgent }) {
  const icon = statusIconChar(agent.status);
  const statusColor = statusColorVar(agent.status);

  return (
    <div className="rs-agent-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
        background: `${statusColor}18`,
        border: `1.5px solid ${statusColor}40`,
      }}>
        {agent.status === 'running' ? <Spinner size={14} /> : icon}
      </div>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--rs-text)' }}>
          Agent {agent.id}: {agent.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--rs-muted)', marginTop: 2 }}>
          {agent.sections.length} sections
          {agent.lineCount > 0 && ` · ${agent.lineCount} lines`}
          {agent.status === 'stuck' && ' · ⚠️ Stuck'}
        </div>
      </div>
      <span className="rs-badge" style={{
        background: `${statusColor}18`,
        color: statusColor,
      }}>
        {agent.status}
      </span>
    </div>
  );
}

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

function ActionBar({ phase, onCheckStatus, onCancel }: {
  phase: string; onCheckStatus: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderTop: '1px solid var(--rs-border)' }}>
      {(phase === 'researching' || phase === 'synthesizing') && (
        <>
          <button onClick={onCheckStatus} className="rs-button primary">Check Status</button>
          <button onClick={onCancel} className="rs-button secondary">Cancel</button>
        </>
      )}
      {phase === 'awaiting_approval' && (
        <span style={{ fontSize: 12, color: 'var(--rs-warning)' }}>
          Approve the plan in the chat to begin research
        </span>
      )}
      {phase === 'complete' && (
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rs-success)' }}>
          ✓ Research complete — check the output files
        </span>
      )}
    </div>
  );
}

// ── Idle View ───────────────────────────────────────────────

function IdleView({ onStart, history }: {
  onStart: () => void;
  history: Array<{ question: string; outputDir: string; agentCount: number; completedAt: string }>;
}) {
  return (
    <>
      <div style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
        <div className="rs-empty-orb rs-animate-in" style={{ marginBottom: 20 }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--rs-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Multi-Agent Research
        </h2>
        <p style={{ margin: '8px 0 20px', maxWidth: 300, fontSize: 14, lineHeight: 1.6, color: 'var(--rs-muted)' }}>
          Decompose any question into parallel workstreams. Multiple agents research simultaneously and synthesize results.
        </p>
        <button onClick={onStart} className="rs-button primary">Start Research</button>
      </div>

      {history.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--rs-border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--rs-dim)', marginBottom: 8 }}>
            History
          </div>
          {history.slice(0, 5).map((entry, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--rs-muted)', padding: '6px 0', borderBottom: i < history.length - 1 ? '1px solid var(--rs-border)' : 'none' }}>
              <div style={{ color: 'var(--rs-text)', fontWeight: 400 }}>
                {entry.question.length > 70 ? entry.question.slice(0, 70) + '…' : entry.question}
              </div>
              <div style={{ fontSize: 11, marginTop: 2 }}>
                {entry.agentCount} agents · {entry.outputDir}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="rs-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
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

export default ResearchApp;
