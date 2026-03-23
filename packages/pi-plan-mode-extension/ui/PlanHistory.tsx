/**
 * PlanHistory — browse and manage archived plans.
 *
 * Two sub-views:
 *   list   — index.json entries (no plan data loaded)
 *   detail — single plan-*.json loaded on demand
 *
 * Delete removes the plan file and updates index.json.
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { AppContext } from '@sero-ai/app-runtime';
import type { PlanIndex, PlanIndexEntry, ArchivedPlan, PlanStep } from '../shared/types';
import { DEFAULT_INDEX } from '../shared/types';

// ── IPC bridge (minimal typed subset) ────────────────────────

interface AppStateBridge {
  read(filePath: string): Promise<unknown>;
  write(filePath: string, data: unknown): Promise<void>;
  remove(filePath: string): Promise<void>;
  watch(filePath: string): Promise<unknown>;
  unwatch(filePath: string): Promise<void>;
  onChange(cb: (filePath: string, data: unknown) => void): () => void;
}
function getAppState(): AppStateBridge {
  return (window as unknown as { sero: { appState: AppStateBridge } }).sero.appState;
}

// ── Helpers ──────────────────────────────────────────────────

function resolveDir(stateFilePath: string): string {
  return stateFilePath.replace(/\/[^/]+$/, '');
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      + ' at '
      + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// ── PlanHistory (root) ───────────────────────────────────────

export function PlanHistory({ onBack }: { onBack: () => void }) {
  const ctx = useContext(AppContext);
  const stateFilePath = ctx?.stateFilePath ?? '';
  const dir = stateFilePath ? resolveDir(stateFilePath) : '';
  const indexPath = dir ? `${dir}/index.json` : '';

  const [index, setIndex] = useState<PlanIndex>(DEFAULT_INDEX);
  const [selected, setSelected] = useState<PlanIndexEntry | null>(null);

  // Watch index.json
  useEffect(() => {
    if (!indexPath) return;
    const api = getAppState();
    const unsub = api.onChange((fp: string, data: unknown) => {
      if (fp === indexPath && data != null) setIndex(data as PlanIndex);
    });
    api.watch(indexPath).then((current) => {
      if (current != null) setIndex(current as PlanIndex);
    });
    return () => { unsub(); api.unwatch(indexPath); };
  }, [indexPath]);

  const handleDelete = useCallback(async (entry: PlanIndexEntry) => {
    if (!indexPath || !dir) return;
    const api = getAppState();
    // Remove plan file
    await api.remove(`${dir}/${entry.filename}`);
    // Update index
    const updated: PlanIndex = {
      plans: index.plans.filter((p) => p.filename !== entry.filename),
    };
    await api.write(indexPath, updated);
    // If we were viewing this plan, go back to list
    if (selected?.filename === entry.filename) setSelected(null);
  }, [indexPath, dir, index, selected]);

  if (selected) {
    return (
      <PlanDetail
        entry={selected}
        dir={dir}
        onBack={() => setSelected(null)}
        onDelete={() => handleDelete(selected)}
      />
    );
  }

  return (
    <PlanList
      plans={index.plans}
      onBack={onBack}
      onSelect={setSelected}
      onDelete={handleDelete}
    />
  );
}

// ── Plan list view ───────────────────────────────────────────

function PlanList({ plans, onBack, onSelect, onDelete }: {
  plans: PlanIndexEntry[];
  onBack: () => void;
  onSelect: (entry: PlanIndexEntry) => void;
  onDelete: (entry: PlanIndexEntry) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0, padding: '20px 20px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} className="pm-button secondary" style={{ padding: '6px 12px', fontSize: 12 }}>
          ← Back
        </button>
        <h1 style={headerStyle}>Plan History</h1>
        <span style={{ fontSize: 12, color: 'var(--pm-muted)' }}>
          {plans.length} {plans.length === 1 ? 'plan' : 'plans'}
        </span>
      </div>

      <div style={{ flex: '1 1 0%', overflowY: 'auto', padding: '4px 20px 20px' }}>
        {plans.length === 0 ? (
          <EmptyHistory />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plans.map((entry) => (
              <PlanRow key={entry.filename} entry={entry} onSelect={onSelect} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanRow({ entry, onSelect, onDelete }: {
  entry: PlanIndexEntry;
  onSelect: (e: PlanIndexEntry) => void;
  onDelete: (e: PlanIndexEntry) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--pm-bg-elevated)', border: '1px solid var(--pm-border)',
      borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
      transition: 'border-color 0.15s',
    }}
      onClick={() => onSelect(entry)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--pm-accent)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--pm-border)'; }}
    >
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.summary || 'Untitled plan'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--pm-muted)', marginTop: 3 }}>
          {formatDate(entry.completedAt)} · {entry.stepCount} steps
        </div>
      </div>
      <span style={badgeStyle}>✓ Complete</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(entry); }}
        style={deleteButtonStyle}
        title="Delete plan"
      >
        ✕
      </button>
    </div>
  );
}

// ── Plan detail view (lazy-loaded) ───────────────────────────

function PlanDetail({ entry, dir, onBack, onDelete }: {
  entry: PlanIndexEntry; dir: string;
  onBack: () => void; onDelete: () => void;
}) {
  const [plan, setPlan] = useState<ArchivedPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAppState()
      .read(`${dir}/${entry.filename}`)
      .then((data) => { if (!cancelled && data) setPlan(data as ArchivedPlan); })
      .catch((err) => console.error('[PlanDetail] load failed:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dir, entry.filename]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} className="pm-button secondary" style={{ padding: '6px 12px', fontSize: 12 }}>
            ← Back
          </button>
          <h1 style={headerStyle}>Archived Plan</h1>
          <span style={badgeStyle}>✓ Complete</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--pm-muted)' }}>
          {formatDate(entry.completedAt)} · {entry.stepCount} steps
        </div>
      </div>

      {/* Steps */}
      <div style={{ flex: '1 1 0%', overflowY: 'auto', padding: '4px 20px 20px' }}>
        {loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--pm-muted)' }}>Loading…</div>
        ) : plan ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {plan.steps.map((step) => (
              <StepRow key={step.step} step={step} />
            ))}
          </ul>
        ) : (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--pm-dim)' }}>Could not load plan file.</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--pm-border)', display: 'flex', alignItems: 'center' }}>
        <button onClick={onDelete} className="pm-button secondary" style={{ color: 'var(--pm-danger)' }}>
          Delete Plan
        </button>
      </div>
    </div>
  );
}

function StepRow({ step }: { step: PlanStep }) {
  return (
    <li style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
      fontSize: 13, color: step.completed ? 'var(--pm-dim)' : 'var(--pm-muted)',
      textDecoration: step.completed ? 'line-through' : 'none',
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 5, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        fontSize: 10, fontWeight: 600, marginTop: 1,
        border: `1.5px solid ${step.completed ? 'var(--pm-success)' : 'var(--pm-dim)'}`,
        background: step.completed ? 'rgba(52, 211, 153, 0.12)' : 'transparent',
        color: step.completed ? 'var(--pm-success)' : 'var(--pm-dim)',
      }}>
        {step.completed ? '✓' : step.step}
      </span>
      <span style={{ flex: '1 1 0%', lineHeight: 1.5 }}>{step.text}</span>
    </li>
  );
}

function EmptyHistory() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 0', textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📋</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--pm-text)' }}>No past plans</div>
      <div style={{ fontSize: 13, color: 'var(--pm-muted)', marginTop: 4, maxWidth: 240 }}>
        Completed plans will be archived here automatically.
      </div>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em',
  color: 'var(--pm-text)', fontFamily: "'DM Sans', system-ui, sans-serif",
};

const badgeStyle: React.CSSProperties = {
  flexShrink: 0, fontSize: 11, fontWeight: 600,
  color: 'var(--pm-success)', background: 'rgba(52, 211, 153, 0.12)',
  padding: '2px 8px', borderRadius: 4,
};

const deleteButtonStyle: React.CSSProperties = {
  flexShrink: 0, width: 28, height: 28, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: '1px solid transparent',
  color: 'var(--pm-dim)', fontSize: 12, cursor: 'pointer',
  transition: 'all 0.15s',
};

export default PlanHistory;
