/**
 * SlopZilla — main Sero app component.
 *
 * Orchestrates the four phases:
 *   1. Config  — pick complexity + technologies
 *   2. Generating — AI generates 3 ideas via useAI
 *   3. Picking — user picks one of the 3 ideas
 *   4. Launching — creates workspace + session, kicks off agent
 *
 * State is persisted via useAppState so history survives across sessions.
 */

import { useCallback, useState } from 'react';
import { useAppState, useAI } from '@sero/app-runtime';
import type { SlopZillaState, Complexity, AppIdea } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { SLOP_STYLES } from './slop-styles';
import { ConfigPhase } from './ConfigPhase';
import { GeneratingPhase } from './GeneratingPhase';
import { PickingPhase } from './PickingPhase';
import { LaunchPhase } from './LaunchPhase';
import './styles.css';

// ── Idea parser ────────────────────────────────────────────

function parseIdeasResponse(response: string): AppIdea[] {
  try {
    // Try to find a JSON array in the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: Record<string, unknown>, i: number) => ({
          id: i + 1,
          name: String(item.name || `App ${i + 1}`),
          tagline: String(item.tagline || ''),
          description: String(item.description || ''),
          techStack: Array.isArray(item.techStack)
            ? item.techStack.map(String)
            : [],
          slopScore: clampScore(Number(item.slopScore) || 5),
        }));
      }
    }
  } catch {
    // Fall through to manual parsing
  }

  // Fallback: try to parse numbered items
  return parseFallback(response);
}

function parseFallback(text: string): AppIdea[] {
  const ideas: AppIdea[] = [];
  const blocks = text.split(/\n(?=\d+[\.\)]\s)/);

  for (const block of blocks) {
    const nameMatch = block.match(/\*\*(.+?)\*\*|"(.+?)"|(?:Name:\s*)(.+?)(?:\n|$)/i);
    const name = nameMatch?.[1] || nameMatch?.[2] || nameMatch?.[3];
    if (!name) continue;

    const taglineMatch = block.match(/(?:Tagline|Subtitle):\s*(.+?)(?:\n|$)/i);
    const descMatch = block.match(/(?:Description|About):\s*(.+?)(?:\n\n|\n(?=[A-Z]))/is);
    const slopMatch = block.match(/(?:Slop|Score):\s*(\d+)/i);

    ideas.push({
      id: ideas.length + 1,
      name: name.trim(),
      tagline: taglineMatch?.[1]?.trim() || 'Pure, unfiltered slop',
      description: descMatch?.[1]?.trim() || block.slice(0, 200).trim(),
      techStack: extractTech(block),
      slopScore: clampScore(Number(slopMatch?.[1]) || 5),
    });
  }

  return ideas.slice(0, 3);
}

function extractTech(text: string): string[] {
  const known = [
    'React', 'Vue', 'Svelte', 'Three.js', 'Canvas', 'WebSocket',
    'SQLite', 'Node.js', 'Python', 'Rust', 'Go', 'WebAssembly',
    'Tailwind', 'GraphQL', 'WebGL', 'Web Audio', 'TypeScript',
    'Next.js', 'Express', 'FastAPI', 'D3.js', 'CSS',
  ];
  return known.filter((t) => text.toLowerCase().includes(t.toLowerCase()));
}

function clampScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

// ── AI prompt builder ──────────────────────────────────────

function buildIdeaPrompt(
  complexity: Complexity,
  technologies: string[],
  history: SlopZillaState['history'],
): string {
  const complexityDesc = {
    low: 'Simple apps — something achievable in under an hour. Single page, minimal features, fun and quick.',
    medium: 'Medium complexity — a few features, decent UI, some state management. A solid afternoon project.',
    high: 'Complex and ambitious — multi-page, external APIs, real architecture. A weekend project at minimum.',
  };

  const techClause = technologies.length > 0
    ? `\n\nThe user wants these technologies used: ${technologies.join(', ')}. Incorporate them creatively into the ideas.`
    : '\n\nPick interesting and appropriate technologies for each idea.';

  const historyClause = history.length > 0
    ? `\n\nIMPORTANT — The user has already built these apps previously. Do NOT generate ideas that are the same or very similar to any of these:\n${history.map((h) => `- "${h.idea.name}": ${h.idea.tagline}`).join('\n')}\n\nCome up with completely different, fresh ideas.`
    : '';

  return `You are SlopZilla, a kaiju-sized AI idea generator. Generate exactly 3 creative, fun, and slightly absurd app ideas. These should be real buildable apps, but with a humorous twist. Think weird mashups, unexpected use cases, or absurdly specific tools.

Complexity level: ${complexity.toUpperCase()}
${complexityDesc[complexity]}${techClause}${historyClause}

Respond with a JSON array of exactly 3 objects. Each object must have these fields:
- "name": string (catchy app name, 1-3 words)
- "tagline": string (funny one-liner, max 10 words)
- "description": string (2-3 sentences explaining what it does and why it's gloriously absurd)
- "techStack": string[] (3-5 technologies to build it with)
- "slopScore": number (1-10, how absurdly "sloppy" this idea is — higher = more unhinged)

Make each idea distinct. One should be relatively practical (slopScore 2-4), one should be moderately weird (slopScore 5-7), and one should be peak absurdity (slopScore 8-10).

Respond ONLY with the JSON array, no other text.`;
}

// ── Main Component ─────────────────────────────────────────

export function SlopZilla() {
  const [state, updateState] = useAppState<SlopZillaState>(DEFAULT_STATE);
  const ai = useAI();

  // Local UI state (not persisted)
  const [phase, setPhase] = useState(state.phase === 'launched' ? 'config' : state.phase);
  const [ideas, setIdeas] = useState<AppIdea[] | null>(state.ideas);
  const [chosenIdea, setChosenIdea] = useState<AppIdea | null>(state.chosenIdea);
  const [complexity, setComplexity] = useState<Complexity>(state.complexity || 'medium');
  const [error, setError] = useState<string | null>(null);

  // ── Generate ideas ──────────────────────────────────────

  const handleGenerate = useCallback(
    async (comp: Complexity, technologies: string[]) => {
      setComplexity(comp);
      setPhase('generating');
      setError(null);

      updateState((prev) => ({
        ...prev,
        phase: 'generating',
        complexity: comp,
        technologies,
        ideas: null,
      }));

      try {
        const prompt = buildIdeaPrompt(comp, technologies, state.history);
        const response = await ai.prompt(prompt);
        const parsed = parseIdeasResponse(response);

        if (parsed.length === 0) {
          setError('SlopZilla could not parse the ideas. Trying again might help!');
          setPhase('config');
          updateState((prev) => ({ ...prev, phase: 'config' }));
          return;
        }

        // Ensure we have exactly 3 ideas
        const final = parsed.slice(0, 3);
        while (final.length < 3) {
          final.push({
            id: final.length + 1,
            name: `Mystery Slop ${final.length + 1}`,
            tagline: 'So mysterious even SlopZilla is confused',
            description: 'This idea is so avant-garde it defies description. Build it and find out what happens.',
            techStack: ['React', 'TypeScript', 'Vibes'],
            slopScore: 7,
          });
        }

        setIdeas(final);
        setPhase('picking');
        updateState((prev) => ({ ...prev, phase: 'picking', ideas: final }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
        setPhase('config');
        updateState((prev) => ({ ...prev, phase: 'config' }));
      }
    },
    [ai, updateState],
  );

  // ── Pick an idea ────────────────────────────────────────

  const handlePick = useCallback(
    (idea: AppIdea) => {
      setChosenIdea(idea);
      setPhase('launching');
      updateState((prev) => ({
        ...prev,
        phase: 'launching',
        chosenIdea: idea,
      }));
    },
    [updateState],
  );

  // ── Launch completed ────────────────────────────────────

  const handleLaunched = useCallback(
    (workspaceId: string, sessionId: string) => {
      updateState((prev) => {
        const MAX_HISTORY = 10;
        const newHistory = chosenIdea
          ? [
              ...prev.history,
              {
                idea: chosenIdea,
                launchedAt: new Date().toISOString(),
                workspaceId,
              },
            ].slice(-MAX_HISTORY)
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

  // ── Reset to config ─────────────────────────────────────

  const handleBack = useCallback(() => {
    setPhase('config');
    setIdeas(null);
    setChosenIdea(null);
    setError(null);
    updateState((prev) => ({
      ...prev,
      phase: 'config',
      ideas: null,
      chosenIdea: null,
      launchedWorkspaceId: null,
      launchedSessionId: null,
    }));
  }, [updateState]);

  // ── Render ──────────────────────────────────────────────

  return (
    <>
      <style>{SLOP_STYLES}</style>
      <div className="sz-root sz-scanlines flex h-full w-full flex-col overflow-y-auto relative">
        <div className="sz-atmosphere" />

        {error && (
          <div
            className="mx-6 mt-4 px-4 py-2 rounded-lg text-sm relative z-10"
            style={{
              background: 'rgba(255, 43, 94, 0.1)',
              border: '1px solid rgba(255, 43, 94, 0.3)',
              color: 'var(--sz-red)',
            }}
          >
            {error}
          </div>
        )}

        {phase === 'config' && (
          <ConfigPhase onGenerate={handleGenerate} />
        )}

        {phase === 'generating' && (
          <GeneratingPhase />
        )}

        {phase === 'picking' && ideas && (
          <PickingPhase
            ideas={ideas}
            onPick={handlePick}
            onRegenerate={() => handleGenerate(complexity, state.technologies)}
          />
        )}

        {phase === 'launching' && chosenIdea && (
          <LaunchPhase
            idea={chosenIdea}
            complexity={complexity}
            onLaunched={handleLaunched}
            onBack={handleBack}
          />
        )}

        {/* History footer */}
        {state.history.length > 0 && phase === 'config' && (
          <HistoryFooter history={state.history} />
        )}
      </div>
    </>
  );
}

// ── History footer ─────────────────────────────────────────

function HistoryFooter({ history }: { history: SlopZillaState['history'] }) {
  return (
    <div
      className="mt-auto px-6 py-4 relative z-10"
      style={{ borderTop: '1px solid var(--sz-border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className="sz-kaiju-text text-xs"
          style={{ color: 'var(--sz-neon-dim)' }}
        >
          Destruction Log ({history.length}/10)
        </h3>
        <span className="text-xs" style={{ color: 'var(--sz-text-dim)', opacity: 0.5 }}>
          SlopZilla remembers these to avoid repeats
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...history].reverse().map((entry, i) => (
          <div
            key={`${entry.workspaceId}-${i}`}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{
              background: 'var(--sz-neon-subtle)',
              color: 'var(--sz-text-dim)',
              border: '1px solid var(--sz-border)',
            }}
            title={`${entry.idea.tagline} — launched ${new Date(entry.launchedAt).toLocaleDateString()}`}
          >
            {entry.idea.name}
            <span className="ml-1 opacity-50">
              ({entry.idea.slopScore}/10)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SlopZilla;
