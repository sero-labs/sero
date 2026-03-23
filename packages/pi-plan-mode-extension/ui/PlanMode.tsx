/**
 * PlanMode — Sero web UI for the plan-mode extension.
 *
 * All styles use the CUSTOM_STYLES block or inline styles — NO Tailwind
 * utility classes. Federated remotes don't get the host's Tailwind output,
 * so utility classes are unreliable.
 */

import { useCallback, useMemo, useState } from 'react';
import { useAppState, useAgentPrompt } from '@sero-ai/app-runtime';
import type { PlanModeState, PlanStep, PlanMode as Mode } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { PlanHistory } from './PlanHistory';

// ── Styles ───────────────────────────────────────────────────

const CUSTOM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap');

  .pm-root {
    --pm-bg: #0f1117;
    --pm-bg-surface: #191b23;
    --pm-bg-elevated: #22252f;
    --pm-text: #e8e4df;
    --pm-muted: #8b8d97;
    --pm-dim: #5c5e6a;
    --pm-accent: #818cf8;
    --pm-accent-hover: #a5b4fc;
    --pm-accent-glow: rgba(129, 140, 248, 0.12);
    --pm-success: #34d399;
    --pm-warning: #fbbf24;
    --pm-danger: #f87171;
    --pm-border: rgba(255, 255, 255, 0.07);
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background: var(--pm-bg);
    color: var(--pm-text);
  }
  @supports (color: var(--bg-base)) {
    .pm-root {
      --pm-bg: var(--bg-base, #0f1117);
      --pm-bg-surface: var(--bg-surface, #191b23);
      --pm-bg-elevated: var(--bg-elevated, #22252f);
      --pm-text: var(--text-primary, #e8e4df);
      --pm-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .pm-card {
    background: var(--pm-bg-surface);
    border: 1px solid var(--pm-border);
    border-radius: 12px;
  }

  .pm-progress-bar { height: 3px; border-radius: 2px; background: var(--pm-bg-elevated); overflow: hidden; margin-top: 12px; }
  .pm-progress-fill { height: 100%; border-radius: 2px; background: var(--pm-accent); transition: width 0.3s ease; }

  .pm-step-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

  .pm-step-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 8px; transition: background 0.15s; }
  .pm-step-item:hover { background: var(--pm-bg-elevated); }
  .pm-step-item.active { background: rgba(129, 140, 248, 0.06); }

  .pm-step-marker { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 11px; font-weight: 600; transition: all 0.15s; }
  .pm-step-marker.pending { border: 1.5px solid var(--pm-dim); color: var(--pm-dim); background: transparent; }
  .pm-step-marker.done { border: 1.5px solid var(--pm-success); background: rgba(52, 211, 153, 0.12); color: var(--pm-success); }
  .pm-step-marker.active { border: 1.5px solid var(--pm-accent); background: var(--pm-accent-glow); color: var(--pm-accent); animation: pm-marker-pulse 1.8s ease-in-out infinite; }

  @keyframes pm-marker-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0.3); }
    50% { box-shadow: 0 0 0 4px rgba(129, 140, 248, 0); }
  }
  @keyframes pm-spin { to { transform: rotate(360deg); } }
  .pm-spinner { animation: pm-spin 0.8s linear infinite; }

  .pm-button { border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 500; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .pm-button:disabled { opacity: 0.35; cursor: default; }
  .pm-button.primary { background: var(--pm-accent); color: #fff; }
  .pm-button.primary:hover:not(:disabled) { background: var(--pm-accent-hover); box-shadow: 0 0 20px var(--pm-accent-glow); }
  .pm-button.secondary { background: var(--pm-bg-elevated); color: var(--pm-muted); }
  .pm-button.secondary:hover:not(:disabled) { color: var(--pm-text); }

  .pm-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .pm-badge.normal { background: var(--pm-bg-elevated); color: var(--pm-dim); }
  .pm-badge.plan { background: rgba(251, 191, 36, 0.12); color: var(--pm-warning); }
  .pm-badge.execute { background: rgba(52, 211, 153, 0.12); color: var(--pm-success); }

  .pm-empty-orb { width: 56px; height: 56px; border-radius: 50%; background: radial-gradient(circle at 40% 40%, var(--pm-accent) 0%, transparent 70%); opacity: 0.15; animation: pm-pulse 3s ease-in-out infinite; }
  @keyframes pm-pulse {
    0%, 100% { transform: scale(1); opacity: 0.15; }
    50% { transform: scale(1.1); opacity: 0.25; }
  }
  @keyframes pm-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .pm-animate-in { animation: pm-fade-in 0.3s ease-out both; }
`;

// ── PlanMode Component ───────────────────────────────────────

export function PlanMode() {
  const [state] = useAppState<PlanModeState>(DEFAULT_STATE);
  const prompt = useAgentPrompt();
  const [view, setView] = useState<'current' | 'history'>('current');

  const togglePlan = useCallback(() => prompt('/plan'), [prompt]);
  const executePlan = useCallback(() => prompt('/plan-execute'), [prompt]);
  const showProgress = useCallback(() => prompt('/plan-todos'), [prompt]);

  const { mode, steps } = state;
  const completed = steps.filter((s) => s.completed).length;
  const total = steps.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const activeStepNum = useMemo(() => {
    if (mode !== 'execute' || total === 0) return null;
    return steps.find((s) => !s.completed)?.step ?? null;
  }, [mode, steps, total]);

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="pm-root" style={{ display: 'flex', height: '100%', width: '100%', flexDirection: 'column', overflow: 'hidden', padding: 24 }}>
        <div className="pm-card" style={{ display: 'flex', flex: '1 1 0%', flexDirection: 'column', overflow: 'hidden' }}>
          {view === 'history' ? (
            <PlanHistory onBack={() => setView('current')} />
          ) : (
            <>
              <Header mode={mode} completed={completed} total={total} progress={progress} activeStepNum={activeStepNum} />
              <div style={{ flex: '1 1 0%', overflowY: 'auto', padding: '8px 20px' }}>
                {total === 0 ? (
                  <EmptyState mode={mode} />
                ) : (
                  <ul className="pm-step-list pm-animate-in">
                    {steps.map((step) => (
                      <StepItem key={step.step} step={step} isActive={step.step === activeStepNum} />
                    ))}
                  </ul>
                )}
              </div>
              <ActionBar mode={mode} hasSteps={total > 0} allComplete={total > 0 && completed === total} onTogglePlan={togglePlan} onExecute={executePlan} onShowProgress={showProgress} onShowHistory={() => setView('history')} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────

function Header({ mode, completed, total, progress, activeStepNum }: {
  mode: Mode; completed: number; total: number; progress: number; activeStepNum: number | null;
}) {
  return (
    <div style={{ flexShrink: 0, padding: '20px 20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--pm-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Plan Mode
        </h1>
        {mode === 'execute' && total > 0 && completed < total ? (
          <button className="pm-button primary" style={{ padding: '5px 14px', fontSize: 12 }} disabled>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spinner size={12} />
              Step {activeStepNum} of {total}
            </span>
          </button>
        ) : (
          <ModeBadge mode={mode} />
        )}
      </div>

      {mode !== 'normal' && total > 0 && (
        <div className="pm-progress-bar">
          <div className="pm-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {total > 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--pm-muted)' }}>
          <span>
            <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--pm-accent)' }}>{completed}</strong>
            {' / '}{total} complete
          </span>
          {mode === 'execute' && completed < total && (
            <span style={{ color: 'var(--pm-success)' }}>● Executing</span>
          )}
          {mode === 'execute' && completed === total && (
            <span style={{ color: 'var(--pm-success)' }}>✓ Done</span>
          )}
        </div>
      )}
    </div>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  const labels: Record<Mode, string> = { normal: 'Normal', plan: '⏸ Plan', execute: '▶ Execute' };
  return <span className={`pm-badge ${mode}`}>{labels[mode]}</span>;
}

function StepItem({ step, isActive }: { step: PlanStep; isActive: boolean }) {
  const markerClass = step.completed ? 'done' : isActive ? 'active' : 'pending';
  return (
    <li className={`pm-step-item ${isActive ? 'active' : ''}`}>
      <div className={`pm-step-marker ${markerClass}`}>
        {step.completed ? <CheckIcon /> : isActive ? <Spinner size={12} /> : step.step}
      </div>
      <span style={{
        flex: '1 1 0%', fontSize: 14,
        color: step.completed ? 'var(--pm-dim)' : isActive ? 'var(--pm-text)' : 'var(--pm-muted)',
        textDecoration: step.completed ? 'line-through' : 'none',
        fontWeight: isActive ? 500 : 400,
        transition: 'color 0.15s',
      }}>
        {step.text}
      </span>
      {isActive && (
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--pm-accent)' }}>
          In progress
        </span>
      )}
    </li>
  );
}

function ActionBar({ mode, hasSteps, allComplete, onTogglePlan, onExecute, onShowProgress, onShowHistory }: {
  mode: Mode; hasSteps: boolean; allComplete: boolean;
  onTogglePlan: () => void; onExecute: () => void; onShowProgress: () => void; onShowHistory: () => void;
}) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderTop: '1px solid var(--pm-border)' }}>
      <button onClick={onTogglePlan} className="pm-button secondary">
        {mode === 'normal' ? 'Enable Plan Mode' : 'Disable Plan Mode'}
      </button>
      {mode === 'plan' && hasSteps && (
        <button onClick={onExecute} className="pm-button primary">Execute Plan</button>
      )}
      {mode === 'execute' && hasSteps && !allComplete && (
        <button onClick={onShowProgress} className="pm-button secondary">Show Progress</button>
      )}
      {allComplete && (
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: 'var(--pm-success)' }}>
          ✓ All steps complete
        </span>
      )}
      <button onClick={onShowHistory} className="pm-button secondary" style={{ marginLeft: allComplete ? 8 : 'auto' }}>
        History
      </button>
    </div>
  );
}

function EmptyState({ mode }: { mode: Mode }) {
  const messages: Record<Mode, { title: string; subtitle: string }> = {
    normal: { title: 'No active plan', subtitle: 'Enable plan mode to have the agent explore your codebase and build a step-by-step plan before making changes.' },
    plan: { title: 'Planning…', subtitle: 'Ask the agent to analyse your code. It will call plan_todos to save the plan.' },
    execute: { title: 'Ready to execute', subtitle: 'Waiting for plan steps…' },
  };
  const { title, subtitle } = messages[mode];
  return (
    <div className="pm-animate-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
      <div className="pm-empty-orb" style={{ marginBottom: 20 }} />
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--pm-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{title}</h2>
      <p style={{ margin: '8px 0 0', maxWidth: 260, fontSize: 14, lineHeight: 1.6, color: 'var(--pm-muted)' }}>{subtitle}</p>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth={3} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="pm-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

export default PlanMode;
