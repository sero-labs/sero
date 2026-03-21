/**
 * RevisionRequestForm — textarea + submit button for requesting
 * revisions on a review card's PR.
 */

import { useState } from 'react';

export function RevisionRequestForm({
  onSubmit,
  isBusy,
}: {
  onSubmit: (feedback: string) => void;
  isBusy?: boolean;
}) {
  const [text, setText] = useState('');
  const hasFeedback = text.trim().length > 0;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        backgroundColor: 'rgba(245, 158, 11, 0.04)',
        marginBottom: '8px',
      }}
    >
      <label
        style={{ fontSize: '11px', fontWeight: 500, color: '#f59e0b', display: 'block', marginBottom: '8px' }}
      >
        Request Revisions
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isBusy}
        placeholder="Describe what needs to change..."
        rows={3}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: '6px',
          border: '1px solid rgba(245, 158, 11, 0.15)',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          color: '#e8e4df',
          fontSize: '12px',
          lineHeight: 1.5,
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isBusy || !hasFeedback}
        style={{
          marginTop: '8px',
          width: '100%',
          padding: '8px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          backgroundColor: hasFeedback ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
          color: hasFeedback ? '#f59e0b' : '#5c5e6a',
          fontSize: '12px',
          fontWeight: 500,
          cursor: !isBusy && hasFeedback ? 'pointer' : 'default',
          transition: 'all 0.15s',
          opacity: isBusy ? 0.6 : 1,
        }}
      >
        Send Back for Revisions
      </button>
      <p style={{ fontSize: '10px', color: '#5c5e6a', marginTop: '4px', lineHeight: 1.4 }}>
        Moves card back to implementation with your feedback.
      </p>
    </div>
  );
}
