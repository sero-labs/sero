/**
 * IdleView — empty state with research input and history list.
 */

import { useState, useCallback } from 'react';
import type { ResearchHistoryEntry } from '../shared/types';

interface IdleViewProps {
  onStart: (question: string) => void;
  history: ResearchHistoryEntry[];
}

export function IdleView({ onStart, history }: IdleViewProps) {
  const [question, setQuestion] = useState('');

  const handleSubmit = useCallback(() => {
    const q = question.trim();
    if (q) {
      onStart(q);
      setQuestion('');
    }
  }, [question, onStart]);

  return (
    <>
      <div style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
        <div className="rs-empty-orb rs-animate-in" style={{ marginBottom: 20 }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--rs-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Multi-Agent Research
        </h2>
        <p style={{ margin: '8px 0 20px', maxWidth: 360, fontSize: 14, lineHeight: 1.6, color: 'var(--rs-muted)' }}>
          Decompose any question into parallel workstreams. Multiple agents research simultaneously and synthesize results.
        </p>
        <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 420 }}>
          <input
            className="rs-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="What do you want to research?"
          />
          <button
            onClick={handleSubmit}
            className="rs-button primary"
            disabled={!question.trim()}
          >
            Research
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--rs-border)', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--rs-dim)', marginBottom: 8 }}>
            History
          </div>
          {history.slice(0, 5).map((entry, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--rs-muted)', padding: '6px 0', borderBottom: i < Math.min(history.length, 5) - 1 ? '1px solid var(--rs-border)' : 'none' }}>
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
