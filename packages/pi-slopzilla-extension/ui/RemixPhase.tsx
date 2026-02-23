/**
 * RemixPhase — tweak an idea before launching.
 *
 * User can edit name, tagline, toggle tech stack, adjust slop score,
 * and add a custom twist. Changes are applied directly to the idea
 * (no AI re-generation) so it's instant.
 */

import { useState, useCallback } from 'react';
import type { AppIdea } from '../shared/types';
import { TECH_OPTIONS } from '../shared/types';
import { clampScore } from './idea-utils';

// ── Slop score labels ──────────────────────────────────────

function slopLabel(score: number): string {
  if (score <= 2) return 'Mildly Sloppy';
  if (score <= 4) return 'Respectably Sloppy';
  if (score <= 6) return 'Certified Slop';
  if (score <= 8) return 'Maximum Slop';
  return 'TRANSCENDENT SLOP';
}

function slopColor(score: number): string {
  if (score <= 3) return 'var(--sz-neon)';
  if (score <= 6) return 'var(--sz-orange)';
  return 'var(--sz-red)';
}

// ── Editable field ─────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const shared = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    placeholder,
    className: 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-all',
    style: {
      background: 'var(--sz-bg-surface)',
      border: '1px solid var(--sz-border)',
      color: 'var(--sz-text)',
    } as React.CSSProperties,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--sz-neon)';
      e.currentTarget.style.boxShadow = '0 0 8px var(--sz-neon-glow)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--sz-border)';
      e.currentTarget.style.boxShadow = 'none';
    },
  };

  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5 uppercase tracking-wider"
        style={{ color: 'var(--sz-neon-dim)' }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={3} />
      ) : (
        <input {...shared} type="text" />
      )}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────

interface RemixPhaseProps {
  idea: AppIdea;
  onLaunch: (remixed: AppIdea, twist: string) => void;
  onBack: () => void;
}

// ── Main Component ─────────────────────────────────────────

export function RemixPhase({ idea, onLaunch, onBack }: RemixPhaseProps) {
  const [name, setName] = useState(idea.name);
  const [tagline, setTagline] = useState(idea.tagline);
  const [description, setDescription] = useState(idea.description);
  const [slopScore, setSlopScore] = useState(idea.slopScore);
  const [techSet, setTechSet] = useState<Set<string>>(
    new Set(idea.techStack),
  );
  const [twist, setTwist] = useState('');

  const toggleTech = useCallback((tech: string) => {
    setTechSet((prev) => {
      const next = new Set(prev);
      if (next.has(tech)) next.delete(tech);
      else next.add(tech);
      return next;
    });
  }, []);

  const handleLaunch = useCallback(() => {
    const remixed: AppIdea = {
      ...idea,
      name: name.trim() || idea.name,
      tagline: tagline.trim() || idea.tagline,
      description: description.trim() || idea.description,
      techStack: [...techSet],
      slopScore: clampScore(slopScore),
    };
    onLaunch(remixed, twist.trim());
  }, [idea, name, tagline, description, techSet, slopScore, twist, onLaunch]);

  const color = slopColor(slopScore);

  return (
    <div className="sz-animate-fade-up flex flex-col items-center px-6 py-8 relative z-10">
      {/* Header */}
      <div className="text-center mb-8">
        <h2
          className="sz-kaiju-text text-2xl mb-2"
          style={{ color: 'var(--sz-purple)' }}
        >
          REMIX THE SLOP
        </h2>
        <p className="text-sm" style={{ color: 'var(--sz-text-dim)' }}>
          Tweak the idea before unleashing it. Change whatever you want.
        </p>
      </div>

      {/* Edit form */}
      <div className="w-full max-w-lg flex flex-col gap-4 mb-8">
        <Field label="Name" value={name} onChange={setName} placeholder="App name" />
        <Field label="Tagline" value={tagline} onChange={setTagline} placeholder="Funny one-liner" />
        <Field
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="What does it do?"
          multiline
        />

        {/* Slop score slider */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5 uppercase tracking-wider"
            style={{ color: 'var(--sz-neon-dim)' }}
          >
            Slop Score
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              value={slopScore}
              onChange={(e) => setSlopScore(Number(e.target.value))}
              className="sz-slop-slider flex-1"
              style={{ accentColor: color }}
            />
            <div className="flex flex-col items-end">
              <span className="text-lg font-mono font-bold" style={{ color }}>
                {slopScore}/10
              </span>
              <span className="text-[10px]" style={{ color }}>
                {slopLabel(slopScore)}
              </span>
            </div>
          </div>
        </div>

        {/* Tech stack toggles */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5 uppercase tracking-wider"
            style={{ color: 'var(--sz-neon-dim)' }}
          >
            Tech Stack
          </label>
          <div className="flex flex-wrap gap-2">
            {TECH_OPTIONS.map((tech) => (
              <button
                key={tech}
                className={`sz-tech-chip ${techSet.has(tech) ? 'selected' : ''}`}
                onClick={() => toggleTech(tech)}
              >
                {tech}
              </button>
            ))}
          </div>
        </div>

        {/* Custom twist */}
        <Field
          label="Add a Twist (optional)"
          value={twist}
          onChange={setTwist}
          placeholder='e.g. "make it multiplayer" or "set it in space"'
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          className="text-sm px-5 py-2.5 rounded-full transition-all"
          style={{
            color: 'var(--sz-text-dim)',
            border: '1px solid var(--sz-border)',
            background: 'transparent',
          }}
          onClick={onBack}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--sz-border-bright)';
            e.currentTarget.style.color = 'var(--sz-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--sz-border)';
            e.currentTarget.style.color = 'var(--sz-text-dim)';
          }}
        >
          Back to Ideas
        </button>

        <button
          className="sz-cta"
          onClick={handleLaunch}
          disabled={techSet.size === 0}
        >
          <span>LAUNCH REMIXED SLOP</span>
        </button>
      </div>
    </div>
  );
}
