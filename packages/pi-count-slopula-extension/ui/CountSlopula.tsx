/**
 * CountSlopula — main Sero app component.
 *
 * Two-tab layout:
 *   - Summon tab — config -> generating -> picking -> remix -> launching
 *   - The Crypt tab — ritual log + entombed pieces
 *
 * State is persisted via useAppState so history & saved pieces survive.
 */

import { useCallback, useMemo, useState, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useAppState, useAI } from '@sero/app-runtime';
import type {
  CountSlopulaState,
  Intensity,
  ContentPiece,
  BuildStatus,
} from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { SLOPULA_STYLES } from './slopula-styles';
import { buildContentPrompt, parsePiecesResponse, padPieces } from './content-utils';
import { ConfigPhase } from './ConfigPhase';
import { GeneratingPhase } from './GeneratingPhase';
import { PickingPhase } from './PickingPhase';
import { RemixPhase } from './RemixPhase';
import { LaunchPhase } from './LaunchPhase';
import { HistoryDashboard } from './HistoryDashboard';
import './styles.css';

// ── Error Boundary ─────────────────────────────────────────

interface EBProps { children: ReactNode; onReset?: () => void }
interface EBState { error: Error | null }

class PhaseErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CountSlopula] Phase crashed:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
          <pre
            className="text-sm leading-tight font-mono select-none text-center mb-6"
            style={{ color: 'var(--cs-crimson)' }}
            aria-hidden="true"
          >{`     /\\     /\\
    {  \\   /  }
     \\  \\_/  /
      \\     /
    .-'(x x)'-.
   /    ~~~    \\
  |  *garlic*  |
   \\   =====   /
    '-._____.-'`}</pre>
          <h2 className="cs-vampire-text text-xl mb-2" style={{ color: 'var(--cs-crimson)' }}>
            THE COUNT HAS FALLEN!
          </h2>
          <p className="text-sm text-center mb-2 italic" style={{ color: 'var(--cs-text)' }}>
            Something went horribly wrong in the crypt.
          </p>
          <p className="text-xs text-center mb-6 max-w-sm italic" style={{ color: 'var(--cs-text-dim)' }}>
            {this.state.error.message}
          </p>
          <button className="cs-cta" onClick={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}>
            <span>Resurrect the Count</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Tab type ───────────────────────────────────────────────

type Tab = 'summon' | 'crypt';

// ── Main Component ─────────────────────────────────────────

export function CountSlopula() {
  const [state, updateState] = useAppState<CountSlopulaState>(DEFAULT_STATE);
  const ai = useAI();

  // Tab & phase
  const [tab, setTab] = useState<Tab>('summon');
  const [phase, setPhase] = useState(state.phase === 'launched' ? 'config' : state.phase);
  const [pieces, setPieces] = useState<ContentPiece[] | null>(state.pieces);
  const [chosenPiece, setChosenPiece] = useState<ContentPiece | null>(state.chosenPiece);
  const [intensity, setIntensity] = useState<Intensity>(state.intensity || 'bite');
  const [remixTwist, setRemixTwist] = useState('');
  const [error, setError] = useState<string | null>(null);

  const savedPieces = state.savedPieces ?? [];
  const history = state.history ?? [];
  const savedPieceNames = useMemo(
    () => new Set(savedPieces.map((s) => s.piece.name)),
    [savedPieces],
  );

  const historyCount = history.length;

  // ── Generate content ──────────────────────────────────────

  const handleGenerate = useCallback(
    async (int: Intensity, genres: string[]) => {
      setIntensity(int);
      setPhase('generating');
      setError(null);
      updateState((prev) => ({
        ...prev, phase: 'generating', intensity: int, genres, pieces: null,
      }));
      try {
        const prompt = buildContentPrompt(int, genres, history);
        const response = await ai.prompt(prompt);
        const parsed = parsePiecesResponse(response);
        if (parsed.length === 0) {
          setError('Count Slopula could not parse the content. The ritual may need repeating!');
          setPhase('config');
          updateState((prev) => ({ ...prev, phase: 'config' }));
          return;
        }
        const final = padPieces(parsed);
        setPieces(final);
        setPhase('picking');
        updateState((prev) => ({ ...prev, phase: 'picking', pieces: final }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The summoning failed');
        setPhase('config');
        updateState((prev) => ({ ...prev, phase: 'config' }));
      }
    },
    [ai, history, updateState],
  );

  // ── Pick / Remix / Save ─────────────────────────────────

  const handlePick = useCallback(
    (piece: ContentPiece) => {
      setChosenPiece(piece);
      setRemixTwist('');
      setPhase('launching');
      updateState((prev) => ({ ...prev, phase: 'launching', chosenPiece: piece }));
    },
    [updateState],
  );

  const handleStartRemix = useCallback(
    (piece: ContentPiece) => {
      setChosenPiece(piece);
      setPhase('remix');
      updateState((prev) => ({ ...prev, phase: 'remix', chosenPiece: piece }));
    },
    [updateState],
  );

  const handleRemixLaunch = useCallback(
    (remixed: ContentPiece, twist: string) => {
      setChosenPiece(remixed);
      setRemixTwist(twist);
      setPhase('launching');
      updateState((prev) => ({ ...prev, phase: 'launching', chosenPiece: remixed }));
    },
    [updateState],
  );

  const handleSave = useCallback(
    (piece: ContentPiece) => {
      updateState((prev) => {
        const list = prev.savedPieces ?? [];
        const exists = list.some((s) => s.piece.name === piece.name);
        if (exists) return { ...prev, savedPieces: list.filter((s) => s.piece.name !== piece.name) };
        return {
          ...prev,
          savedPieces: [...list, { piece, savedAt: new Date().toISOString() }].slice(-20),
        };
      });
    },
    [updateState],
  );

  const handleDeleteSaved = useCallback(
    (piece: ContentPiece) => {
      updateState((prev) => ({
        ...prev,
        savedPieces: (prev.savedPieces ?? []).filter((s) => s.piece.name !== piece.name),
      }));
    },
    [updateState],
  );

  const handleLaunchSaved = useCallback(
    (piece: ContentPiece) => {
      setChosenPiece(piece);
      setRemixTwist('');
      setPhase('launching');
      setTab('summon');
      updateState((prev) => ({
        ...prev,
        phase: 'launching',
        chosenPiece: piece,
        savedPieces: (prev.savedPieces ?? []).filter((s) => s.piece.name !== piece.name),
      }));
    },
    [updateState],
  );

  // ── Launch completed / status ───────────────────────────

  const handleLaunched = useCallback(
    (workspaceId: string, sessionId: string, sessionPath: string) => {
      updateState((prev) => {
        const newHistory = chosenPiece
          ? [...prev.history, {
              piece: chosenPiece,
              launchedAt: new Date().toISOString(),
              workspaceId,
              sessionId,
              sessionPath,
              status: 'launched' as const,
            }].slice(-10)
          : prev.history;
        return {
          ...prev,
          phase: 'launched' as const,
          launchedWorkspaceId: workspaceId,
          launchedSessionId: sessionId,
          history: newHistory,
        };
      });
    },
    [chosenPiece, updateState],
  );

  const handleStatusChange = useCallback(
    (workspaceId: string, status: BuildStatus) => {
      updateState((prev) => ({
        ...prev,
        history: prev.history.map((h) =>
          h.workspaceId === workspaceId ? { ...h, status } : h,
        ),
      }));
    },
    [updateState],
  );

  // ── Reset / navigation ──────────────────────────────────

  const handleBack = useCallback(() => {
    setPhase('config');
    setPieces(null);
    setChosenPiece(null);
    setRemixTwist('');
    setError(null);
    updateState((prev) => ({
      ...prev, phase: 'config', pieces: null, chosenPiece: null,
      launchedWorkspaceId: null, launchedSessionId: null,
    }));
  }, [updateState]);

  const handleBackToPicking = useCallback(() => {
    setPhase('picking');
    setChosenPiece(null);
    setRemixTwist('');
    updateState((prev) => ({ ...prev, phase: 'picking', chosenPiece: null }));
  }, [updateState]);

  // ── Render ──────────────────────────────────────────────

  return (
    <>
      <style>{SLOPULA_STYLES}</style>
      <div className="cs-root cs-mist flex h-full w-full flex-col overflow-hidden relative">
        <div className="cs-atmosphere" />

        {/* Tab bar */}
        <div className="cs-tab-bar relative z-10">
          <button
            className={`cs-tab ${tab === 'summon' ? 'active' : ''}`}
            onClick={() => setTab('summon')}
          >
            Summon
          </button>
          <button
            className={`cs-tab ${tab === 'crypt' ? 'active' : ''}`}
            onClick={() => setTab('crypt')}
          >
            The Crypt
            {historyCount > 0 && (
              <span className="cs-tab-badge">{historyCount}</span>
            )}
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto relative flex flex-col">
          {error && (
            <div
              className="mx-6 mt-3 px-4 py-2 rounded text-sm relative z-10 italic"
              style={{
                background: 'rgba(220, 20, 60, 0.1)',
                border: '1px solid rgba(220, 20, 60, 0.3)',
                color: 'var(--cs-crimson)',
              }}
            >
              {error}
            </div>
          )}

          {tab === 'summon' && (
            <PhaseErrorBoundary onReset={handleBack}>
              {phase === 'config' && (
                <ConfigPhase onGenerate={handleGenerate} />
              )}
              {phase === 'generating' && <GeneratingPhase />}
              {phase === 'picking' && pieces && (
                <PickingPhase
                  pieces={pieces}
                  onPick={handlePick}
                  onRemix={handleStartRemix}
                  onSave={handleSave}
                  savedPieceNames={savedPieceNames}
                  onRegenerate={() => handleGenerate(intensity, state.genres)}
                />
              )}
              {phase === 'remix' && chosenPiece && (
                <RemixPhase
                  piece={chosenPiece}
                  onLaunch={handleRemixLaunch}
                  onBack={handleBackToPicking}
                />
              )}
              {phase === 'launching' && chosenPiece && (
                <LaunchPhase
                  piece={chosenPiece}
                  intensity={intensity}
                  twist={remixTwist || undefined}
                  onLaunched={handleLaunched}
                  onBack={handleBack}
                />
              )}
            </PhaseErrorBoundary>
          )}

          {tab === 'crypt' && (
            <HistoryDashboard
              history={history}
              savedPieces={savedPieces}
              onStatusChange={handleStatusChange}
              onLaunchSaved={handleLaunchSaved}
              onDeleteSaved={handleDeleteSaved}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default CountSlopula;
