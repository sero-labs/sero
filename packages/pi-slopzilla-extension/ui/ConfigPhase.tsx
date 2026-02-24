/**
 * ConfigPhase — the SlopZilla landing screen (Generate tab).
 *
 * Compact layout: inline hero, complexity picker, tech picker, generate CTA.
 * Saved ideas and history live on the History tab now.
 */

import { useState, useCallback } from 'react';
import type { Complexity } from '../shared/types';
import { TECH_OPTIONS } from '../shared/types';

// ── Compact Godzilla ASCII ────────────────────────────────

const GODZILLA_ART = `      /\\/\\/\\
     /  o    \\___
    /    __   __/
   |____/  \\_/
     |      |
    _|      |_
   |__|    |__|`;

const COMPLEXITY_DATA: { value: Complexity; label: string; kaiju: string; desc: string }[] = [
  {
    value: 'low',
    label: 'Baby Kaiju',
    kaiju: '( o_o)',
    desc: 'Quick & dirty — build in a coffee break.',
  },
  {
    value: 'medium',
    label: 'Mega Kaiju',
    kaiju: '\\(O_O)/',
    desc: 'Multiple features, decent UI, real functionality.',
  },
  {
    value: 'high',
    label: 'SLOPZILLA',
    kaiju: '\\[O_O]/ ~*',
    desc: 'Full send. Complex architecture, the works.',
  },
];

interface ConfigPhaseProps {
  onGenerate: (complexity: Complexity, technologies: string[]) => void;
}

export function ConfigPhase({ onGenerate }: ConfigPhaseProps) {
  const [complexity, setComplexity] = useState<Complexity | null>(null);
  const [selectedTech, setSelectedTech] = useState<Set<string>>(new Set());

  const toggleTech = useCallback((tech: string) => {
    setSelectedTech((prev) => {
      const next = new Set(prev);
      if (next.has(tech)) next.delete(tech);
      else next.add(tech);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!complexity) return;
    onGenerate(complexity, [...selectedTech]);
  }, [complexity, selectedTech, onGenerate]);

  return (
    <div className="sz-animate-fade-up flex flex-col items-center justify-center h-full px-6 py-6 relative z-10">
      {/* Hero — art beside title */}
      <div className="flex items-center gap-8 mb-8">
        <pre
          className="text-xs leading-tight select-none shrink-0"
          style={{ color: 'var(--sz-neon)', filter: 'drop-shadow(0 0 8px var(--sz-neon-glow))' }}
          aria-hidden="true"
        >
          {GODZILLA_ART}
        </pre>
        <div>
          <h1 className="sz-title sz-animate-breathe">SlopZilla</h1>
          <p className="sz-subtitle mt-2">
            The Kaiju-Sized AI Slop Idea Generator
          </p>
          <p className="mt-3 text-sm max-w-md" style={{ color: 'var(--sz-text-dim)' }}>
            Pick your destruction level, choose your weapons, and let SlopZilla
            stomp out 3 gloriously unhinged app ideas.
          </p>
        </div>
      </div>

      {/* Complexity picker */}
      <div className="w-full max-w-2xl mb-8">
        <h2
          className="sz-kaiju-text text-sm mb-4 text-center"
          style={{ color: 'var(--sz-neon-dim)' }}
        >
          Choose Your Destruction Level
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {COMPLEXITY_DATA.map((c) => (
            <div
              key={c.value}
              className={`sz-complexity-card ${complexity === c.value ? 'selected' : ''}`}
              onClick={() => setComplexity(c.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setComplexity(c.value)}
            >
              <div className="relative z-10">
                <div
                  className="text-2xl font-mono text-center mb-2 select-none"
                  style={{ color: complexity === c.value ? 'var(--sz-neon)' : 'var(--sz-text-dim)' }}
                >
                  {c.kaiju}
                </div>
                <h3
                  className="sz-kaiju-text text-center text-base mb-1"
                  style={{ color: complexity === c.value ? 'var(--sz-neon)' : 'var(--sz-text)' }}
                >
                  {c.label}
                </h3>
                <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--sz-text-dim)' }}>
                  {c.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tech picker */}
      <div className="w-full max-w-2xl mb-8">
        <h2
          className="sz-kaiju-text text-sm mb-3 text-center"
          style={{ color: 'var(--sz-neon-dim)' }}
        >
          Arm Your Kaiju (Optional)
        </h2>
        <div className="flex flex-wrap gap-2 justify-center">
          {TECH_OPTIONS.map((tech) => (
            <button
              key={tech}
              className={`sz-tech-chip ${selectedTech.has(tech) ? 'selected' : ''}`}
              onClick={() => toggleTech(tech)}
            >
              {tech}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        className="sz-cta"
        onClick={handleGenerate}
        disabled={!complexity}
      >
        <span>
          {complexity ? 'UNLEASH THE SLOP' : 'Pick a destruction level first'}
        </span>
      </button>
    </div>
  );
}
