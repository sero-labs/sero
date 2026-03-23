/**
 * SlopZilla — main Sero app component.
 *
 * Two-tab layout:
 *   • Generate tab — config → generating → picking → remix → launching
 *   • History tab  — destruction log + saved ideas
 *
 * State is persisted via useAppState so history & saved ideas survive.
 */

import { useCallback, useMemo, useState, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useAppState, useAI } from '@sero-ai/app-runtime';
import type {
  SlopZillaState,
  Complexity,
  AppIdea,
  BuildStatus,
} from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { SLOP_STYLES } from './slop-styles';
import { buildIdeaPrompt, parseIdeasResponse, padIdeas } from './idea-utils';
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
    console.error('[SlopZilla] Phase crashed:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
          <pre
            className="text-sm leading-tight font-mono select-none text-center mb-6"
            style={{ color: 'var(--sz-red)' }}
            aria-hidden="true"
          >{`      /\\/\\/\\\n     /  x    \\___\n    /    __   __/\n   |____/  \\_/\n     |  ~~  |\n    _| ~~~~ |_\n   |__|    |__|`}</pre>
          <h2 className="sz-kaiju-text text-xl mb-2" style={{ color: 'var(--sz-red)' }}>
            KAIJU MALFUNCTION!
          </h2>
          <p className="text-sm text-center mb-2" style={{ color: 'var(--sz-text)' }}>
            Something went wrong inside SlopZilla.
          </p>
          <p className="text-xs text-center mb-6 max-w-sm" style={{ color: 'var(--sz-text-dim)' }}>
            {this.state.error.message}
          </p>
          <button className="sz-cta" onClick={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}>
            <span>Reset SlopZilla</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Tab type ───────────────────────────────────────────────

type Tab = 'generate' | 'history';

// ── Main Component ─────────────────────────────────────────

export function SlopZilla() {
  const [state, updateState] = useAppState<SlopZillaState>(DEFAULT_STATE);
  const ai = useAI();

  // Tab & phase
  const [tab, setTab] = useState<Tab>('generate');
  const [phase, setPhase] = useState(state.phase === 'launched' ? 'config' : state.phase);
  const [ideas, setIdeas] = useState<AppIdea[] | null>(state.ideas);
  const [chosenIdea, setChosenIdea] = useState<AppIdea | null>(state.chosenIdea);
  const [complexity, setComplexity] = useState<Complexity>(state.complexity || 'medium');
  const [remixTwist, setRemixTwist] = useState('');
  const [error, setError] = useState<string | null>(null);

  const savedIdeas = state.savedIdeas ?? [];
  const history = state.history ?? [];
  const savedIdeaNames = useMemo(
    () => new Set(savedIdeas.map((s) => s.idea.name)),
    [savedIdeas],
  );

  const historyCount = history.length;
  const savedCount = savedIdeas.length;

  // ── Generate ideas ──────────────────────────────────────

  const handleGenerate = useCallback(
    async (comp: Complexity, technologies: string[]) => {
      setComplexity(comp);
      setPhase('generating');
      setError(null);
      updateState((prev) => ({
        ...prev, phase: 'generating', complexity: comp, technologies, ideas: null,
      }));
      try {
        const prompt = buildIdeaPrompt(comp, technologies, history);
        const response = await ai.prompt(prompt);
        const parsed = parseIdeasResponse(response);
        if (parsed.length === 0) {
          setError('SlopZilla could not parse the ideas. Trying again might help!');
          setPhase('config');
          updateState((prev) => ({ ...prev, phase: 'config' }));
          return;
        }
        const final = padIdeas(parsed);
        setIdeas(final);
        setPhase('picking');
        updateState((prev) => ({ ...prev, phase: 'picking', ideas: final }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
        setPhase('config');
        updateState((prev) => ({ ...prev, phase: 'config' }));
      }
    },
    [ai, history, updateState],
  );

  // ── Pick / Remix / Save ─────────────────────────────────

  const handlePick = useCallback(
    (idea: AppIdea) => {
      setChosenIdea(idea);
      setRemixTwist('');
      setPhase('launching');
      updateState((prev) => ({ ...prev, phase: 'launching', chosenIdea: idea }));
    },
    [updateState],
  );

  const handleStartRemix = useCallback(
    (idea: AppIdea) => {
      setChosenIdea(idea);
      setPhase('remix');
      updateState((prev) => ({ ...prev, phase: 'remix', chosenIdea: idea }));
    },
    [updateState],
  );

  const handleRemixLaunch = useCallback(
    (remixed: AppIdea, twist: string) => {
      setChosenIdea(remixed);
      setRemixTwist(twist);
      setPhase('launching');
      updateState((prev) => ({ ...prev, phase: 'launching', chosenIdea: remixed }));
    },
    [updateState],
  );

  const handleSave = useCallback(
    (idea: AppIdea) => {
      updateState((prev) => {
        const list = prev.savedIdeas ?? [];
        const exists = list.some((s) => s.idea.name === idea.name);
        if (exists) return { ...prev, savedIdeas: list.filter((s) => s.idea.name !== idea.name) };
        return {
          ...prev,
          savedIdeas: [...list, { idea, savedAt: new Date().toISOString() }].slice(-20),
        };
      });
    },
    [updateState],
  );

  const handleDeleteSaved = useCallback(
    (idea: AppIdea) => {
      updateState((prev) => ({
        ...prev,
        savedIdeas: (prev.savedIdeas ?? []).filter((s) => s.idea.name !== idea.name),
      }));
    },
    [updateState],
  );

  const handleLaunchSaved = useCallback(
    (idea: AppIdea) => {
      setChosenIdea(idea);
      setRemixTwist('');
      setPhase('launching');
      setTab('generate');
      updateState((prev) => ({
        ...prev,
        phase: 'launching',
        chosenIdea: idea,
        savedIdeas: (prev.savedIdeas ?? []).filter((s) => s.idea.name !== idea.name),
      }));
    },
    [updateState],
  );

  // ── Launch completed / status ───────────────────────────

  const handleLaunched = useCallback(
    (workspaceId: string, sessionId: string, sessionPath: string) => {
      updateState((prev) => {
        const newHistory = chosenIdea
          ? [...prev.history, {
              idea: chosenIdea,
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
    [chosenIdea, updateState],
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
    setIdeas(null);
    setChosenIdea(null);
    setRemixTwist('');
    setError(null);
    updateState((prev) => ({
      ...prev, phase: 'config', ideas: null, chosenIdea: null,
      launchedWorkspaceId: null, launchedSessionId: null,
    }));
  }, [updateState]);

  const handleBackToPicking = useCallback(() => {
    setPhase('picking');
    setChosenIdea(null);
    setRemixTwist('');
    updateState((prev) => ({ ...prev, phase: 'picking', chosenIdea: null }));
  }, [updateState]);

  // ── Render ──────────────────────────────────────────────

  return (
    <>
      <style>{SLOP_STYLES}</style>
      <div className="sz-root sz-scanlines flex h-full w-full flex-col overflow-hidden relative">
        <div className="sz-atmosphere" />

        {/* Tab bar */}
        <div className="sz-tab-bar relative z-10">
          <button
            className={`sz-tab ${tab === 'generate' ? 'active' : ''}`}
            onClick={() => setTab('generate')}
          >
            Generate
          </button>
          <button
            className={`sz-tab ${tab === 'history' ? 'active' : ''}`}
            onClick={() => setTab('history')}
          >
            History
            {historyCount > 0 && (
              <span className="sz-tab-badge">{historyCount}</span>
            )}
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto relative flex flex-col">
          {error && (
            <div
              className="mx-6 mt-3 px-4 py-2 rounded-lg text-sm relative z-10"
              style={{
                background: 'rgba(255, 43, 94, 0.1)',
                border: '1px solid rgba(255, 43, 94, 0.3)',
                color: 'var(--sz-red)',
              }}
            >
              {error}
            </div>
          )}

          {tab === 'generate' && (
            <PhaseErrorBoundary onReset={handleBack}>
              {phase === 'config' && (
                <ConfigPhase onGenerate={handleGenerate} />
              )}
              {phase === 'generating' && <GeneratingPhase />}
              {phase === 'picking' && ideas && (
                <PickingPhase
                  ideas={ideas}
                  onPick={handlePick}
                  onRemix={handleStartRemix}
                  onSave={handleSave}
                  savedIdeaNames={savedIdeaNames}
                  onRegenerate={() => handleGenerate(complexity, state.technologies)}
                />
              )}
              {phase === 'remix' && chosenIdea && (
                <RemixPhase
                  idea={chosenIdea}
                  onLaunch={handleRemixLaunch}
                  onBack={handleBackToPicking}
                />
              )}
              {phase === 'launching' && chosenIdea && (
                <LaunchPhase
                  idea={chosenIdea}
                  complexity={complexity}
                  twist={remixTwist || undefined}
                  onLaunched={handleLaunched}
                  onBack={handleBack}
                />
              )}
            </PhaseErrorBoundary>
          )}

          {tab === 'history' && (
            <HistoryDashboard
              history={history}
              savedIdeas={savedIdeas}
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

export default SlopZilla;
