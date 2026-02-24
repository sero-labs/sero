/**
 * LaunchPhase — creating the workspace and kicking off the agent.
 *
 * Shows a dramatic launch sequence, then a success state with
 * the option to go back and generate more ideas.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppIdea, Complexity } from '../shared/types';
import { launchIdea } from './sero-launcher';
import type { LaunchStep } from './sero-launcher';
import { buildLaunchPrompt } from './idea-utils';

// ── Phase states ───────────────────────────────────────────

type LaunchState = 'launching' | 'success' | 'error';

interface LaunchPhaseProps {
  idea: AppIdea;
  complexity: Complexity;
  twist?: string;
  onLaunched: (workspaceId: string, sessionId: string, sessionPath: string) => void;
  onBack: () => void;
}

export function LaunchPhase({ idea, complexity, twist, onLaunched, onBack }: LaunchPhaseProps) {
  const [state, setState] = useState<LaunchState>('launching');
  const [step, setStep] = useState<LaunchStep>('creating-workspace');
  const [error, setError] = useState<string | null>(null);
  const hasLaunched = useRef(false);

  // Store onLaunched in a ref so the launch callback always sees the
  // latest version without triggering re-fires via the effect.
  const onLaunchedRef = useRef(onLaunched);
  onLaunchedRef.current = onLaunched;

  const doLaunch = useCallback(async () => {
    setState('launching');
    setStep('creating-workspace');
    setError(null);

    try {
      let prompt = buildLaunchPrompt(idea, complexity);
      if (twist) {
        prompt += `\n\n## Remix Twist\nThe user specifically asked for this twist: "${twist}"\nIncorporate it into the build!`;
      }
      const result = await launchIdea(idea.name, prompt, setStep);
      setState('success');
      onLaunchedRef.current(result.workspaceId, result.sessionId, result.sessionPath);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Failed to launch. The kaiju stumbled.');
    }
  }, [idea, complexity, twist]);

  // Fire once on mount — the ref guard prevents re-launches if
  // parent re-renders cause this component to stay mounted.
  useEffect(() => {
    if (hasLaunched.current) return;
    hasLaunched.current = true;
    doLaunch();
  }, [doLaunch]);

  if (state === 'launching') {
    return <LaunchingView idea={idea} step={step} />;
  }

  if (state === 'error') {
    const handleRetry = () => {
      hasLaunched.current = false;
      doLaunch();
    };
    return <ErrorView error={error} onRetry={handleRetry} onBack={onBack} />;
  }

  return <SuccessView idea={idea} onBack={onBack} />;
}

// ── Launch step labels & order ─────────────────────────────

const STEP_ORDER: LaunchStep[] = [
  'creating-workspace',
  'opening-workspace',
  'creating-session',
  'opening-agent',
  'sending-prompt',
  'done',
];

const STEP_LABELS: Record<LaunchStep, string> = {
  'creating-workspace': 'Creating workspace',
  'opening-workspace': 'Opening workspace',
  'creating-session': 'Starting session',
  'opening-agent': 'Waking the agent',
  'sending-prompt': 'Unleashing the build prompt',
  'done': 'Slop deployed!',
};

// ── Launching animation ────────────────────────────────────

function LaunchingView({ idea, step }: { idea: AppIdea; step: LaunchStep }) {
  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="sz-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      {/* Godzilla firing */}
      <pre
        className="text-sm leading-tight font-mono select-none text-center mb-4"
        style={{
          color: 'var(--sz-neon)',
          filter: 'drop-shadow(0 0 16px var(--sz-neon-glow-strong))',
        }}
        aria-hidden="true"
      >
        {`      /\\/\\/\\
     /  @    \\___
    /    __   __/>>=====>
   |____/  \\_/
     |      |
    _|      |_
   |__|    |__|`}
      </pre>

      {/* Fire beam */}
      <div className="w-64 mb-8">
        <div className="sz-fire-beam" />
      </div>

      <h2
        className="sz-kaiju-text text-xl mb-2 text-center sz-animate-breathe"
        style={{ color: 'var(--sz-neon)' }}
      >
        LAUNCHING SLOP
      </h2>

      <p className="text-sm text-center mb-4" style={{ color: 'var(--sz-text)' }}>
        Building workspace for <strong style={{ color: 'var(--sz-neon)' }}>{idea.name}</strong>
      </p>

      {/* Step-by-step progress */}
      <div className="flex flex-col gap-1.5 mb-6 w-64">
        {STEP_ORDER.slice(0, -1).map((s, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span
                className="shrink-0 size-4 flex items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: isDone
                    ? 'var(--sz-neon)'
                    : isActive
                      ? 'var(--sz-neon-subtle)'
                      : 'transparent',
                  color: isDone
                    ? 'var(--sz-bg)'
                    : isActive
                      ? 'var(--sz-neon)'
                      : 'var(--sz-text-dim)',
                  border: isDone
                    ? 'none'
                    : `1px solid ${isActive ? 'var(--sz-neon)' : 'var(--sz-border)'}`,
                  boxShadow: isActive ? '0 0 8px var(--sz-neon-glow)' : 'none',
                }}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span
                style={{
                  color: isDone
                    ? 'var(--sz-neon-dim)'
                    : isActive
                      ? 'var(--sz-neon)'
                      : 'var(--sz-text-dim)',
                  opacity: isDone ? 0.6 : 1,
                }}
              >
                {STEP_LABELS[s]}
                {isActive && (
                  <span className="sz-animate-breathe ml-1">…</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Success view ───────────────────────────────────────────

function SuccessView({ idea, onBack }: { idea: AppIdea; onBack: () => void }) {
  return (
    <div className="sz-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      {/* Victory Godzilla */}
      <pre
        className="text-sm leading-tight font-mono select-none text-center mb-6"
        style={{
          color: 'var(--sz-neon)',
          filter: 'drop-shadow(0 0 20px var(--sz-neon-glow-strong))',
        }}
        aria-hidden="true"
      >
        {`      /\\/\\/\\
     /  ^    \\___
    /    __   __/  RAWR!
   |____/  \\_/
     |\\    /|
    _| \\  / |_
   |__|  \\/|__|`}
      </pre>

      <h2
        className="sz-kaiju-text text-2xl mb-2 text-center"
        style={{ color: 'var(--sz-neon)' }}
      >
        SLOP DEPLOYED!
      </h2>

      <p className="text-sm text-center mb-2" style={{ color: 'var(--sz-text)' }}>
        <strong style={{ color: 'var(--sz-neon)' }}>{idea.name}</strong> has been unleashed!
      </p>

      <p className="text-xs text-center mb-8 max-w-sm" style={{ color: 'var(--sz-text-dim)' }}>
        A new workspace has been created and the Sero Agent is now building your app.
        Check the sidebar to watch the chaos unfold.
      </p>

      {/* Celebrate stats */}
      <div
        className="rounded-xl px-6 py-4 mb-8 text-center"
        style={{
          background: 'var(--sz-neon-subtle)',
          border: '1px solid var(--sz-border)',
        }}
      >
        <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--sz-neon-dim)' }}>
          Mission Stats
        </div>
        <div className="flex gap-8 justify-center">
          <div>
            <div className="sz-kaiju-text text-lg" style={{ color: 'var(--sz-neon)' }}>
              {idea.slopScore}/10
            </div>
            <div className="text-xs" style={{ color: 'var(--sz-text-dim)' }}>Slop Score</div>
          </div>
          <div>
            <div className="sz-kaiju-text text-lg" style={{ color: 'var(--sz-neon)' }}>
              {idea.techStack.length}
            </div>
            <div className="text-xs" style={{ color: 'var(--sz-text-dim)' }}>Technologies</div>
          </div>
          <div>
            <div className="sz-kaiju-text text-lg" style={{ color: 'var(--sz-orange)' }}>
              100%
            </div>
            <div className="text-xs" style={{ color: 'var(--sz-text-dim)' }}>Chaos</div>
          </div>
        </div>
      </div>

      {/* Back button */}
      <button className="sz-cta" onClick={onBack}>
        <span>GENERATE MORE SLOP</span>
      </button>
    </div>
  );
}

// ── Error view ─────────────────────────────────────────────

function ErrorView({
  error,
  onRetry,
  onBack,
}: {
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="sz-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      <pre
        className="text-sm leading-tight font-mono select-none text-center mb-6 sz-animate-shake"
        style={{ color: 'var(--sz-red)' }}
        aria-hidden="true"
      >
        {`      /\\/\\/\\
     /  x    \\___
    /    __   __/
   |____/  \\_/
     |  ~~  |
    _| ~~~~ |_
   |__|    |__|`}
      </pre>

      <h2 className="sz-kaiju-text text-xl mb-2" style={{ color: 'var(--sz-red)' }}>
        KAIJU DOWN!
      </h2>

      <p className="text-sm text-center mb-2" style={{ color: 'var(--sz-text)' }}>
        SlopZilla stumbled while launching
      </p>

      {error && (
        <p className="text-xs text-center mb-6 max-w-sm" style={{ color: 'var(--sz-text-dim)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-4">
        <button className="sz-cta" onClick={onRetry}>
          <span>Try Again</span>
        </button>
        <button
          className="text-sm px-4 py-2 rounded-full"
          style={{
            color: 'var(--sz-text-dim)',
            border: '1px solid var(--sz-border)',
          }}
          onClick={onBack}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
