/**
 * ConfigPhase — the Count Slopula landing screen (Summon tab).
 *
 * Gothic vampire ASCII art, intensity picker (coffin-shaped cards),
 * genre picker, and the "SUMMON THE SLOP" CTA.
 */

import { useState, useCallback } from 'react';
import type { Intensity } from '../shared/types';
import { GENRE_OPTIONS } from '../shared/types';

// ── Vampire ASCII art ──────────────────────────────────────

const VAMPIRE_ART = `     /\\     /\\
    {  \\   /  }
     \\  \\_/  /
      \\     /
    .-'(o o)'-.
   /    |||    \\
  |    (|||)    |
   \\   =====   /
    '-._____.-'
      |     |
     _|     |_
    |___|___|_|`;

const INTENSITY_DATA: { value: Intensity; label: string; fang: string; desc: string }[] = [
  {
    value: 'nibble',
    label: 'Mild Nibble',
    fang: '^..^',
    desc: 'A polite vampire. Cliches are there, but tasteful.',
  },
  {
    value: 'bite',
    label: 'Deep Bite',
    fang: '^vv^',
    desc: 'Fangs are out. Tropes stacked high. No apologies.',
  },
  {
    value: 'drain',
    label: 'FULL DRAIN',
    fang: 'V\\/V',
    desc: 'Every drop of originality drained. Pure concentrated slop.',
  },
];

interface ConfigPhaseProps {
  onGenerate: (intensity: Intensity, genres: string[]) => void;
}

export function ConfigPhase({ onGenerate }: ConfigPhaseProps) {
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());

  const toggleGenre = useCallback((genre: string) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!intensity) return;
    onGenerate(intensity, [...selectedGenres]);
  }, [intensity, selectedGenres, onGenerate]);

  return (
    <div className="cs-animate-fade-up flex flex-col items-center justify-center h-full px-6 py-6 relative z-10">
      {/* Hero — vampire art beside title */}
      <div className="flex items-center gap-8 mb-8">
        <pre
          className="text-xs leading-tight select-none shrink-0 cs-animate-float"
          style={{ color: 'var(--cs-crimson)', filter: 'drop-shadow(0 0 12px var(--cs-crimson-glow))' }}
          aria-hidden="true"
        >
          {VAMPIRE_ART}
        </pre>
        <div>
          <h1 className="cs-title cs-animate-flicker">Count Slopula</h1>
          <p className="cs-subtitle mt-2">
            &ldquo;I vant to drain... your originality!&rdquo;
          </p>
          <p className="mt-3 text-sm max-w-md" style={{ color: 'var(--cs-text-dim)' }}>
            Choose the intensity of cliche, pick your genres, and let the
            Count summon 3 pieces of gloriously unoriginal content from the crypt.
          </p>
        </div>
      </div>

      {/* Intensity picker */}
      <div className="w-full max-w-2xl mb-8">
        <h2
          className="cs-vampire-text text-sm mb-4 text-center"
          style={{ color: 'var(--cs-crimson-dim)' }}
        >
          Choose Your Bite Strength
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {INTENSITY_DATA.map((c) => (
            <div
              key={c.value}
              className={`cs-intensity-card ${intensity === c.value ? 'selected' : ''}`}
              onClick={() => setIntensity(c.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setIntensity(c.value)}
            >
              <div className="relative z-10">
                <div
                  className="text-2xl font-mono text-center mb-2 select-none"
                  style={{ color: intensity === c.value ? 'var(--cs-crimson)' : 'var(--cs-text-dim)' }}
                >
                  {c.fang}
                </div>
                <h3
                  className="cs-vampire-text text-center text-base mb-1"
                  style={{ color: intensity === c.value ? 'var(--cs-crimson)' : 'var(--cs-text)' }}
                >
                  {c.label}
                </h3>
                <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--cs-text-dim)' }}>
                  {c.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Genre picker */}
      <div className="w-full max-w-2xl mb-8">
        <h2
          className="cs-vampire-text text-sm mb-3 text-center"
          style={{ color: 'var(--cs-crimson-dim)' }}
        >
          Choose Your Genres (Optional)
        </h2>
        <div className="flex flex-wrap gap-2 justify-center">
          {GENRE_OPTIONS.map((genre) => (
            <button
              key={genre}
              className={`cs-genre-chip ${selectedGenres.has(genre) ? 'selected' : ''}`}
              onClick={() => toggleGenre(genre)}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        className="cs-cta"
        onClick={handleGenerate}
        disabled={!intensity}
      >
        <span>
          {intensity ? 'SUMMON THE SLOP' : 'Choose a bite strength first...'}
        </span>
      </button>
    </div>
  );
}
