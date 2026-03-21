/**
 * CancelPRConfirmation — two-step cancel button with inline
 * confirmation prompt for discarding a review PR.
 */

import { useState } from 'react';

export function CancelPRConfirmation({
  onConfirm,
  isBusy,
}: {
  onConfirm: () => void;
  isBusy?: boolean;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!showConfirm) {
    return (
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isBusy}
        style={{
          width: '100%',
          padding: '8px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(248, 113, 113, 0.15)',
          backgroundColor: 'transparent',
          color: '#8b8d97',
          fontSize: '12px',
          fontWeight: 500,
          cursor: isBusy ? 'default' : 'pointer',
          transition: 'all 0.15s',
          opacity: isBusy ? 0.6 : 1,
        }}
      >
        Cancel PR
      </button>
    );
  }

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid rgba(248, 113, 113, 0.25)',
        backgroundColor: 'rgba(248, 113, 113, 0.04)',
      }}
    >
      <p style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px', lineHeight: 1.4 }}>
        This will close the PR on GitHub, move the card back to Backlog, and remove the local worktree.
      </p>
      <div className="flex" style={{ gap: '8px' }}>
        <button
          onClick={onConfirm}
          disabled={isBusy}
          style={{
            flex: 1,
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'rgba(248, 113, 113, 0.15)',
            color: '#f87171',
            fontSize: '12px',
            fontWeight: 600,
            cursor: isBusy ? 'default' : 'pointer',
            transition: 'all 0.15s',
            opacity: isBusy ? 0.6 : 1,
          }}
        >
          Confirm Cancel
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          disabled={isBusy}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'transparent',
            color: '#8b8d97',
            fontSize: '12px',
            fontWeight: 500,
            cursor: isBusy ? 'default' : 'pointer',
            transition: 'all 0.15s',
            opacity: isBusy ? 0.6 : 1,
          }}
        >
          Keep
        </button>
      </div>
    </div>
  );
}
