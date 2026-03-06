/**
 * ReviewActivityPanel — step-based pipeline view for the review phase.
 *
 * Shows a horizontal step indicator (Check → Review → Push → PR)
 * with the current step highlighted, elapsed time, agent pills,
 * and a scrolling tool activity feed when the reviewer uses tools.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { ReviewProgress } from '../../shared/types';

// ── Review pipeline steps ───────────────────────────────────

const STEPS = [
  { key: 'check', label: 'Diff' },
  { key: 'review', label: 'Review' },
  { key: 'push', label: 'Push' },
  { key: 'pr', label: 'PR' },
] as const;

/** Map the progress phase string to a step index (0-3). */
function resolveStepIndex(phase: string | undefined): number {
  if (!phase) return 0;
  if (phase.includes('Checking') || phase.includes('Recovering')) return 0;
  if (phase.includes('Reviewing') || phase.includes('Review')) return 1;
  if (phase.includes('Pushing')) return 2;
  if (phase.includes('Creating PR')) return 3;
  return 0;
}

// ── Helpers ─────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read: '📖', bash: '📂', write: '✏️', edit: '✏️',
  ls: '📁', find: '🔍', grep: '🔎', glob: '🔍',
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${Math.round(ms / 1000)}s`;
}

// ── Component ───────────────────────────────────────────────

export function ReviewActivityPanel({ progress }: { progress?: ReviewProgress }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!progress?.startedAt) return;
    const tick = () => setElapsed(formatElapsed(progress.startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [progress?.startedAt]);

  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress?.recentTools?.length]);

  const activeStep = resolveStepIndex(progress?.phase);
  const hasToolFeed = (progress?.recentTools?.length ?? 0) > 0;

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '8px',
        border: '1px solid rgba(167, 139, 250, 0.2)',
        backgroundColor: 'rgba(167, 139, 250, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Step pipeline */}
      <StepPipeline activeStep={activeStep} />

      {/* Phase + elapsed */}
      <div
        className="flex items-center"
        style={{ padding: '10px 14px 6px', gap: '10px' }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#a78bfa',
            animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#a78bfa', flex: 1 }}>
          {progress?.phase ?? 'Starting review…'}
        </span>
        {elapsed && (
          <span style={{ fontSize: '10px', color: '#5c5e6a', fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </span>
        )}
      </div>

      {/* Agent status pills */}
      {progress?.agents && progress.agents.length > 0 && (
        <div
          className="flex flex-wrap"
          style={{ padding: '0 14px 10px', gap: '6px' }}
        >
          {progress.agents.map((agent) => (
            <AgentPill key={agent.name} name={agent.name} status={agent.status} />
          ))}
        </div>
      )}

      {/* Tool activity feed */}
      {hasToolFeed && (
        <ToolFeed
          feedRef={feedRef}
          tools={progress!.recentTools}
        />
      )}
    </div>
  );
}

// ── Step pipeline indicator ─────────────────────────────────

function StepPipeline({ activeStep }: { activeStep: number }) {
  return (
    <div
      className="flex items-center"
      style={{ padding: '14px 14px 0', gap: '0' }}
    >
      {STEPS.map((step, i) => {
        const state = i < activeStep ? 'done' : i === activeStep ? 'active' : 'pending';
        return (
          <div key={step.key} className="flex items-center" style={{ flex: 1, minWidth: 0 }}>
            <StepDot state={state} index={i} />
            <span
              style={{
                fontSize: '10px',
                fontWeight: state === 'active' ? 600 : 500,
                marginLeft: '5px',
                color:
                  state === 'done' ? '#34d399'
                    : state === 'active' ? '#a78bfa'
                    : '#5c5e6a',
                whiteSpace: 'nowrap',
              }}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '1px',
                  marginLeft: '8px',
                  backgroundColor:
                    i < activeStep
                      ? 'rgba(52, 211, 153, 0.3)'
                      : 'rgba(255, 255, 255, 0.06)',
                  transition: 'background-color 0.4s',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepDot({ state, index }: { state: 'done' | 'active' | 'pending'; index: number }) {
  if (state === 'done') {
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2, delay: index * 0.05 }}
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: 'rgba(52, 211, 153, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>
    );
  }

  if (state === 'active') {
    return (
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: 'rgba(167, 139, 250, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#a78bfa',
            animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: '#5c5e6a',
          opacity: 0.4,
        }}
      />
    </div>
  );
}

// ── Agent pill ──────────────────────────────────────────────

function AgentPill({ name, status }: { name: string; status: string }) {
  const isRunning = status === 'running';
  const isDone = status === 'completed';
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: '5px',
        fontSize: '10px',
        fontWeight: 500,
        padding: '3px 8px',
        borderRadius: '4px',
        backgroundColor: isRunning
          ? 'rgba(167, 139, 250, 0.12)'
          : isDone
            ? 'rgba(52, 211, 153, 0.12)'
            : 'rgba(248, 113, 113, 0.12)',
        color: isRunning ? '#a78bfa' : isDone ? '#34d399' : '#f87171',
      }}
    >
      {isRunning && (
        <span
          style={{
            display: 'inline-block',
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            backgroundColor: 'currentColor',
            animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
      )}
      {isDone && '✓'}
      {status === 'failed' && '✗'}
      {name}
    </span>
  );
}

// ── Tool activity feed ──────────────────────────────────────

function ToolFeed({
  feedRef,
  tools,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  tools: { tool: string; args: string; running: boolean }[];
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: '120px',
        overflowY: 'auto',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '6px 14px',
      }}
      className="kb-scrollbar"
    >
      {tools.map((entry, i) => (
        <div
          key={`${entry.tool}-${i}`}
          className="flex items-center"
          style={{ gap: '6px', padding: '2px 0' }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              backgroundColor: entry.running ? '#a78bfa' : '#34d399',
              animation: entry.running ? 'kb-pulse 1.5s ease-in-out infinite' : undefined,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '10px', flexShrink: 0 }}>{toolIcon(entry.tool)}</span>
          <span style={{ fontSize: '10px', fontWeight: 500, color: '#5c5e6a', flexShrink: 0 }}>
            {entry.tool}
          </span>
          {entry.args && (
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(139, 141, 151, 0.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {entry.args}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
