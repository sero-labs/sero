/**
 * PlanApprovalPanel — shown when a card's plan is ready and
 * awaiting user approval before advancing to implementation.
 */

import type { Column } from '../../shared/types';

export function PlanApprovalPanel({
  onApprove,
  onReject,
}: {
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        style={{
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          backgroundColor: 'rgba(245, 158, 11, 0.04)',
          marginBottom: '12px',
        }}
      >
        <div className="flex items-center" style={{ gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#f59e0b' }}>
            Plan ready — awaiting approval
          </span>
        </div>
        <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4 }}>
          Review the plan and subtasks below, then approve to advance to implementation.
        </p>
      </div>
      <div className="flex" style={{ gap: '8px' }}>
        <button
          onClick={onApprove}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#818cf8',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Approve &amp; Start
        </button>
        <button
          onClick={onReject}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'transparent',
            color: '#8b8d97',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
