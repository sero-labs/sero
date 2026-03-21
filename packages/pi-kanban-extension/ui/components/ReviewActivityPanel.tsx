/**
 * ReviewActivityPanel — step-based pipeline view for the review phase.
 *
 * Wraps ActivityPanel with purple theme, adds a horizontal step indicator
 * (Diff → Review → Push → PR).
 */

import { motion } from 'motion/react';
import type { ReviewProgress } from '../../shared/types';
import { ActivityPanel, type ActivityPanelTheme } from './ActivityPanel';

const THEME: ActivityPanelTheme = {
  primary: '#a78bfa',
  primaryText: '#a78bfa',
  border: 'rgba(167, 139, 250, 0.2)',
  background: 'rgba(167, 139, 250, 0.04)',
  agentRunningBg: 'rgba(167, 139, 250, 0.12)',
};

// ── Review pipeline steps ───────────────────────────────────

const STEPS = [
  { key: 'check', label: 'Diff' },
  { key: 'review', label: 'Review' },
  { key: 'push', label: 'Push' },
  { key: 'pr', label: 'PR' },
] as const;

function resolveStepIndex(phase: string | undefined): number {
  if (!phase) return 0;
  if (phase.includes('Checking') || phase.includes('Recovering')) return 0;
  if (phase.includes('Reviewing') || phase.includes('Review')) return 1;
  if (phase.includes('Pushing')) return 2;
  if (phase.includes('Creating PR')) return 3;
  return 0;
}

// ── Component ───────────────────────────────────────────────

export function ReviewActivityPanel({ progress }: { progress?: ReviewProgress }) {
  const activeStep = resolveStepIndex(progress?.phase);

  return (
    <ActivityPanel
      theme={THEME}
      data={progress}
      defaultPhase="Starting review…"
      fallbackText="Generating diff, running review, and creating PR."
      feedMaxHeight={120}
      headerSlot={<StepPipeline activeStep={activeStep} />}
    />
  );
}

// ── Step pipeline indicator ─────────────────────────────────

function StepPipeline({ activeStep }: { activeStep: number }) {
  const gridTemplateColumns = STEPS.flatMap((_, i) => (
    i < STEPS.length - 1 ? ['max-content', 'minmax(24px, 1fr)'] : ['max-content']
  )).join(' ');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns,
        alignItems: 'center',
        width: '100%',
        padding: '14px 14px 0',
        columnGap: '8px',
      }}
    >
      {STEPS.flatMap((step, i) => {
        const state = i < activeStep ? 'done' : i === activeStep ? 'active' : 'pending';
        const items = [
          <div key={step.key} className="flex items-center" style={{ minWidth: 0 }}>
            <StepDot state={state} index={i} />
            <span
              style={{
                fontSize: '10px',
                fontWeight: state === 'active' ? 600 : 500,
                marginLeft: '5px',
                color: state === 'done' ? '#34d399' : state === 'active' ? '#a78bfa' : '#5c5e6a',
                whiteSpace: 'nowrap',
              }}
            >
              {step.label}
            </span>
          </div>,
        ];

        if (i < STEPS.length - 1) {
          items.push(
            <div
              key={`${step.key}-connector`}
              style={{
                height: '1px',
                minWidth: '24px',
                backgroundColor: i < activeStep ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                transition: 'background-color 0.4s',
              }}
            />,
          );
        }

        return items;
      })}
    </div>
  );
}

function StepDot({ state, index }: { state: 'done' | 'active' | 'pending'; index: number }) {
  const size = { width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0 as const };
  const center = { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const };

  if (state === 'done') {
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2, delay: index * 0.05 }}
        style={{ ...size, ...center, backgroundColor: 'rgba(52, 211, 153, 0.15)' }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>
    );
  }

  if (state === 'active') {
    return (
      <div style={{ ...size, ...center, backgroundColor: 'rgba(167, 139, 250, 0.15)' }}>
        <span
          style={{
            display: 'block', width: '6px', height: '6px', borderRadius: '50%',
            backgroundColor: '#a78bfa', animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ ...size, ...center, backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
      <span
        style={{
          display: 'block', width: '6px', height: '6px', borderRadius: '50%',
          backgroundColor: '#5c5e6a', opacity: 0.4,
        }}
      />
    </div>
  );
}
