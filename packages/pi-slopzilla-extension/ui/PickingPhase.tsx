/**
 * PickingPhase — displays 3 generated app ideas as monster-movie cards.
 *
 * Each card shows the idea name, tagline, description, tech stack,
 * and a "slop meter" rating. User can build, remix, or save each idea.
 */

import { useState } from 'react';
import type { AppIdea } from '../shared/types';

// ── Slop meter gradient color ──────────────────────────────

function slopColor(score: number): string {
  if (score <= 3) return 'var(--sz-neon)';
  if (score <= 6) return 'var(--sz-orange)';
  return 'var(--sz-red)';
}

function slopLabel(score: number): string {
  if (score <= 2) return 'Mildly Sloppy';
  if (score <= 4) return 'Respectably Sloppy';
  if (score <= 6) return 'Certified Slop';
  if (score <= 8) return 'Maximum Slop';
  return 'TRANSCENDENT SLOP';
}

// ── Idea Card ──────────────────────────────────────────────

function IdeaCard({
  idea,
  index,
  onPick,
  onRemix,
  onSave,
  isSaved,
}: {
  idea: AppIdea;
  index: number;
  onPick: (idea: AppIdea) => void;
  onRemix: (idea: AppIdea) => void;
  onSave: (idea: AppIdea) => void;
  isSaved: boolean;
}) {
  const animClass = `sz-card-enter-${index + 1}`;
  const color = slopColor(idea.slopScore);

  return (
    <div
      className={`sz-idea-card ${animClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onPick(idea)}
      onKeyDown={(e) => e.key === 'Enter' && onPick(idea)}
    >
      {/* Card number badge */}
      <div
        className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
        style={{
          background: 'var(--sz-neon-subtle)',
          color: 'var(--sz-neon)',
          border: '1px solid var(--sz-border)',
        }}
      >
        {index + 1}
      </div>

      {/* Name & tagline */}
      <h3
        className="sz-kaiju-text text-lg mb-1 pr-10"
        style={{ color: 'var(--sz-neon)' }}
      >
        {idea.name}
      </h3>
      <p className="text-sm italic mb-3" style={{ color: 'var(--sz-text-dim)' }}>
        &ldquo;{idea.tagline}&rdquo;
      </p>

      {/* Description */}
      <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--sz-text)' }}>
        {idea.description}
      </p>

      {/* Tech stack chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {idea.techStack.map((tech) => (
          <span
            key={tech}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--sz-neon-subtle)',
              color: 'var(--sz-neon-dim)',
              border: '1px solid var(--sz-border)',
            }}
          >
            {tech}
          </span>
        ))}
      </div>

      {/* Slop meter */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium" style={{ color }}>
            {slopLabel(idea.slopScore)}
          </span>
          <span className="text-xs font-mono" style={{ color }}>
            {idea.slopScore}/10
          </span>
        </div>
        <div className="sz-slop-meter">
          <div
            className="sz-slop-fill"
            style={{
              width: `${idea.slopScore * 10}%`,
              background: `linear-gradient(90deg, var(--sz-neon), ${color})`,
            }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center justify-between pt-3"
        style={{ borderTop: '1px solid var(--sz-border)' }}
      >
        {/* Save for later */}
        <button
          className="text-xs font-medium tracking-wider uppercase px-3 py-1.5 rounded-full transition-all"
          style={{
            color: isSaved ? 'var(--sz-orange)' : 'var(--sz-text-dim)',
            border: `1px solid ${isSaved ? 'var(--sz-orange)' : 'var(--sz-border)'}`,
            background: isSaved ? 'rgba(255, 107, 43, 0.1)' : 'transparent',
          }}
          onClick={(e) => { e.stopPropagation(); onSave(idea); }}
          onMouseEnter={(e) => {
            if (!isSaved) {
              e.currentTarget.style.borderColor = 'var(--sz-orange)';
              e.currentTarget.style.color = 'var(--sz-orange)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSaved) {
              e.currentTarget.style.borderColor = 'var(--sz-border)';
              e.currentTarget.style.color = 'var(--sz-text-dim)';
            }
          }}
        >
          {isSaved ? '★ Saved' : '☆ Save'}
        </button>

        <div className="flex gap-2">
          {/* Remix */}
          <button
            className="text-xs font-medium tracking-wider uppercase px-3 py-1.5 rounded-full transition-all"
            style={{
              color: 'var(--sz-purple)',
              border: '1px solid var(--sz-purple)',
              background: 'rgba(180, 74, 255, 0.06)',
            }}
            onClick={(e) => { e.stopPropagation(); onRemix(idea); }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 12px rgba(180, 74, 255, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Remix
          </button>

          {/* Build */}
          <button
            className="text-xs font-medium tracking-wider uppercase px-3 py-1.5 rounded-full transition-all"
            style={{
              color: 'var(--sz-neon)',
              border: '1px solid var(--sz-neon)',
              background: 'var(--sz-neon-subtle)',
            }}
            onClick={(e) => { e.stopPropagation(); onPick(idea); }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 12px var(--sz-neon-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Build
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

interface PickingPhaseProps {
  ideas: AppIdea[];
  onPick: (idea: AppIdea) => void;
  onRemix: (idea: AppIdea) => void;
  onSave: (idea: AppIdea) => void;
  savedIdeaNames: Set<string>;
  onRegenerate: () => void;
}

export function PickingPhase({
  ideas,
  onPick,
  onRemix,
  onSave,
  savedIdeaNames,
  onRegenerate,
}: PickingPhaseProps) {
  return (
    <div className="flex flex-col items-center px-6 py-8 relative z-10">
      {/* Header */}
      <div className="text-center mb-8">
        <h2
          className="sz-kaiju-text text-2xl mb-2"
          style={{ color: 'var(--sz-neon)' }}
        >
          CHOOSE YOUR SLOP
        </h2>
        <p className="text-sm" style={{ color: 'var(--sz-text-dim)' }}>
          SlopZilla has stomped out 3 ideas. Build one, remix it, or save it for later.
        </p>
      </div>

      {/* Idea cards */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {ideas.map((idea, i) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            index={i}
            onPick={onPick}
            onRemix={onRemix}
            onSave={onSave}
            isSaved={savedIdeaNames.has(idea.name)}
          />
        ))}
      </div>

      {/* Regenerate */}
      <button
        className="text-xs font-medium tracking-wider uppercase px-4 py-2 rounded-full transition-all"
        style={{
          color: 'var(--sz-text-dim)',
          border: '1px solid var(--sz-border)',
          background: 'transparent',
        }}
        onClick={onRegenerate}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--sz-border-bright)';
          e.currentTarget.style.color = 'var(--sz-neon)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--sz-border)';
          e.currentTarget.style.color = 'var(--sz-text-dim)';
        }}
      >
        Not sloppy enough? Regenerate
      </button>
    </div>
  );
}
