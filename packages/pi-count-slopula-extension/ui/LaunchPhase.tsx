/**
 * LaunchPhase — creating the workspace and kicking off the agent.
 *
 * Shows a dramatic vampire ritual sequence, then a success state
 * with the option to go back and summon more content.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ContentPiece, Intensity } from '../shared/types';
import { launchPiece } from './sero-launcher';
import type { LaunchStep } from './sero-launcher';
import { buildLaunchPrompt } from './content-utils';

// ── Phase states ───────────────────────────────────────────

type LaunchState = 'launching' | 'success' | 'error';

interface LaunchPhaseProps {
  piece: ContentPiece;
  intensity: Intensity;
  twist?: string;
  onLaunched: (workspaceId: string, sessionId: string, sessionPath: string) => void;
  onBack: () => void;
}

export function LaunchPhase({ piece, intensity, twist, onLaunched, onBack }: LaunchPhaseProps) {
  const [state, setState] = useState<LaunchState>('launching');
  const [step, setStep] = useState<LaunchStep>('creating-workspace');
  const [error, setError] = useState<string | null>(null);
  const hasLaunched = useRef(false);

  const onLaunchedRef = useRef(onLaunched);
  onLaunchedRef.current = onLaunched;

  const doLaunch = useCallback(async () => {
    setState('launching');
    setStep('creating-workspace');
    setError(null);

    try {
      let prompt = buildLaunchPrompt(piece, intensity);
      if (twist) {
        prompt += `\n\n## Dark Twist\nThe user specifically requested this twist: "${twist}"\nWeave it into the creation!`;
      }
      const result = await launchPiece(piece.name, prompt, setStep);
      setState('success');
      onLaunchedRef.current(result.workspaceId, result.sessionId, result.sessionPath);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'The ritual failed. The Count is displeased.');
    }
  }, [piece, intensity, twist]);

  useEffect(() => {
    if (hasLaunched.current) return;
    hasLaunched.current = true;
    doLaunch();
  }, [doLaunch]);

  if (state === 'launching') {
    return <LaunchingView piece={piece} step={step} />;
  }

  if (state === 'error') {
    const handleRetry = () => {
      hasLaunched.current = false;
      doLaunch();
    };
    return <ErrorView error={error} onRetry={handleRetry} onBack={onBack} />;
  }

  return <SuccessView piece={piece} onBack={onBack} />;
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
  'creating-workspace': 'Digging the crypt',
  'opening-workspace': 'Opening the coffin',
  'creating-session': 'Lighting the candles',
  'opening-agent': 'Summoning the vampire',
  'sending-prompt': 'Performing the ritual',
  'done': 'The slop rises!',
};

// ── Launching animation ────────────────────────────────────

function LaunchingView({ piece, step }: { piece: ContentPiece; step: LaunchStep }) {
  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="cs-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      {/* Ritual circle ASCII */}
      <pre
        className="text-sm leading-tight font-mono select-none text-center mb-4 cs-animate-heartbeat"
        style={{
          color: 'var(--cs-crimson)',
          filter: 'drop-shadow(0 0 16px var(--cs-crimson-glow-strong))',
        }}
        aria-hidden="true"
      >
        {`     .  *  .  *  .
   *    _____    *
  .   /     \\   .
 *   | () () |   *
  .  |  vvv  |  .
   * |       | *
  .   \\_____/   .
   *    |||    *
     .  *  .  *  .`}
      </pre>

      <h2
        className="cs-vampire-text text-xl mb-2 text-center cs-animate-flicker"
        style={{ color: 'var(--cs-crimson)' }}
      >
        THE RITUAL BEGINS
      </h2>

      <p className="text-sm text-center mb-4 italic" style={{ color: 'var(--cs-text)' }}>
        Building a page for <strong style={{ color: 'var(--cs-crimson)' }}>{piece.name}</strong>
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
                    ? 'var(--cs-crimson)'
                    : isActive
                      ? 'var(--cs-crimson-subtle)'
                      : 'transparent',
                  color: isDone
                    ? 'var(--cs-bg)'
                    : isActive
                      ? 'var(--cs-crimson)'
                      : 'var(--cs-text-dim)',
                  border: isDone
                    ? 'none'
                    : `1px solid ${isActive ? 'var(--cs-crimson)' : 'var(--cs-border)'}`,
                  boxShadow: isActive ? '0 0 8px var(--cs-crimson-glow)' : 'none',
                }}
              >
                {isDone ? '~' : i + 1}
              </span>
              <span
                className="italic"
                style={{
                  color: isDone
                    ? 'var(--cs-crimson-dim)'
                    : isActive
                      ? 'var(--cs-crimson)'
                      : 'var(--cs-text-dim)',
                  opacity: isDone ? 0.6 : 1,
                  fontFamily: "'Crimson Text', serif",
                }}
              >
                {STEP_LABELS[s]}
                {isActive && (
                  <span className="cs-animate-flicker ml-1">...</span>
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

function SuccessView({ piece, onBack }: { piece: ContentPiece; onBack: () => void }) {
  return (
    <div className="cs-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      {/* Victory vampire */}
      <pre
        className="text-sm leading-tight font-mono select-none text-center mb-6"
        style={{
          color: 'var(--cs-crimson)',
          filter: 'drop-shadow(0 0 20px var(--cs-crimson-glow-strong))',
        }}
        aria-hidden="true"
      >
        {`     /\\     /\\
    {  \\   /  }
     \\  \\_/  /
      \\  ^  /
    .-'(o o)'-.
   /    ~~~    \\
  |   BLEH!!   |
   \\   =====   /
    '-._____.-'`}
      </pre>

      <h2
        className="cs-vampire-text text-2xl mb-2 text-center"
        style={{ color: 'var(--cs-crimson)' }}
      >
        THE SLOP RISES!
      </h2>

      <p className="text-sm text-center mb-2 italic" style={{ color: 'var(--cs-text)' }}>
        <strong style={{ color: 'var(--cs-crimson)' }}>{piece.name}</strong> has been unleashed upon the world!
      </p>

      <p className="text-xs text-center mb-8 max-w-sm italic" style={{ color: 'var(--cs-text-dim)' }}>
        A new workspace has been created and the Sero Agent is now building your
        glorious cliche-ridden page. Check the sidebar to watch the dark magic unfold.
      </p>

      {/* Stats */}
      <div
        className="rounded px-6 py-4 mb-8 text-center"
        style={{
          background: 'var(--cs-crimson-subtle)',
          border: '1px solid var(--cs-border)',
        }}
      >
        <div className="text-xs tracking-wider italic mb-2" style={{ color: 'var(--cs-crimson-dim)' }}>
          Ritual Statistics
        </div>
        <div className="flex gap-8 justify-center">
          <div>
            <div className="cs-vampire-text text-lg" style={{ color: 'var(--cs-crimson)' }}>
              {piece.slopRating}/10
            </div>
            <div className="text-xs italic" style={{ color: 'var(--cs-text-dim)' }}>Slop Rating</div>
          </div>
          <div>
            <div className="cs-vampire-text text-lg" style={{ color: 'var(--cs-ghost)' }}>
              {piece.genre}
            </div>
            <div className="text-xs italic" style={{ color: 'var(--cs-text-dim)' }}>Genre</div>
          </div>
          <div>
            <div className="cs-vampire-text text-lg" style={{ color: 'var(--cs-gold)' }}>
              100%
            </div>
            <div className="text-xs italic" style={{ color: 'var(--cs-text-dim)' }}>Cliche</div>
          </div>
        </div>
      </div>

      {/* Back button */}
      <button className="cs-cta" onClick={onBack}>
        <span>SUMMON MORE SLOP</span>
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
    <div className="cs-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      <pre
        className="text-sm leading-tight font-mono select-none text-center mb-6 cs-animate-shake"
        style={{ color: 'var(--cs-crimson)' }}
        aria-hidden="true"
      >
        {`     /\\     /\\
    {  \\   /  }
     \\  \\_/  /
      \\     /
    .-'(x x)'-.
   /    ~~~    \\
  |   *cough*  |
   \\   =====   /
    '-._____.-'`}
      </pre>

      <h2 className="cs-vampire-text text-xl mb-2" style={{ color: 'var(--cs-crimson)' }}>
        THE RITUAL FAILED!
      </h2>

      <p className="text-sm text-center mb-2 italic" style={{ color: 'var(--cs-text)' }}>
        Count Slopula choked on a garlic breadstick
      </p>

      {error && (
        <p className="text-xs text-center mb-6 max-w-sm italic" style={{ color: 'var(--cs-text-dim)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-4">
        <button className="cs-cta" onClick={onRetry}>
          <span>Try the Ritual Again</span>
        </button>
        <button
          className="text-sm px-4 py-2 rounded italic"
          style={{
            color: 'var(--cs-text-dim)',
            border: '1px solid var(--cs-border)',
            fontFamily: "'Crimson Text', serif",
          }}
          onClick={onBack}
        >
          Retreat to the Crypt
        </button>
      </div>
    </div>
  );
}
