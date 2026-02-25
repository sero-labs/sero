/**
 * RemixPhase — tweak a content piece before launching.
 *
 * User can edit name, tagline, body, adjust slop rating,
 * and add a custom twist. Changes are applied directly
 * (no AI re-generation) so it's instant.
 */

import { useState, useCallback } from 'react';
import type { ContentPiece } from '../shared/types';
import { GENRE_OPTIONS } from '../shared/types';
import { clampRating } from './content-utils';

// ── Slop rating labels ──────────────────────────────────────

function bloodLabel(rating: number): string {
  if (rating <= 2) return 'Mild Nibble';
  if (rating <= 4) return 'Getting Bitey';
  if (rating <= 6) return 'Deep Bite';
  if (rating <= 8) return 'Full Drain';
  return 'TRANSCENDENT SLOP';
}

function bloodColor(rating: number): string {
  if (rating <= 3) return 'var(--cs-ghost)';
  if (rating <= 6) return 'var(--cs-gold)';
  return 'var(--cs-crimson)';
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
    className: 'w-full rounded px-3 py-2 text-sm outline-none transition-all',
    style: {
      background: 'var(--cs-bg-surface)',
      border: '1px solid var(--cs-border)',
      color: 'var(--cs-text)',
      fontFamily: "'Crimson Text', serif",
    } as React.CSSProperties,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--cs-crimson)';
      e.currentTarget.style.boxShadow = '0 0 8px var(--cs-crimson-glow)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--cs-border)';
      e.currentTarget.style.boxShadow = 'none';
    },
  };

  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5 tracking-wider italic"
        style={{ color: 'var(--cs-crimson-dim)' }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input {...shared} type="text" />
      )}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────

interface RemixPhaseProps {
  piece: ContentPiece;
  onLaunch: (remixed: ContentPiece, twist: string) => void;
  onBack: () => void;
}

// ── Main Component ─────────────────────────────────────────

export function RemixPhase({ piece, onLaunch, onBack }: RemixPhaseProps) {
  const [name, setName] = useState(piece.name);
  const [tagline, setTagline] = useState(piece.tagline);
  const [body, setBody] = useState(piece.body);
  const [slopRating, setSlopRating] = useState(piece.slopRating);
  const [genre, setGenre] = useState(piece.genre);
  const [twist, setTwist] = useState('');

  const handleLaunch = useCallback(() => {
    const remixed: ContentPiece = {
      ...piece,
      name: name.trim() || piece.name,
      tagline: tagline.trim() || piece.tagline,
      body: body.trim() || piece.body,
      genre: genre || piece.genre,
      slopRating: clampRating(slopRating),
    };
    onLaunch(remixed, twist.trim());
  }, [piece, name, tagline, body, genre, slopRating, twist, onLaunch]);

  const color = bloodColor(slopRating);

  return (
    <div className="cs-animate-fade-up flex flex-col items-center px-6 py-8 relative z-10">
      {/* Header */}
      <div className="text-center mb-8">
        <h2
          className="cs-vampire-text text-2xl mb-2"
          style={{ color: 'var(--cs-ghost)' }}
        >
          Remix the Slop
        </h2>
        <p className="text-sm italic" style={{ color: 'var(--cs-text-dim)' }}>
          Tweak the content before the Count builds it. Change whatever you dare.
        </p>
      </div>

      {/* Edit form */}
      <div className="w-full max-w-lg flex flex-col gap-4 mb-8">
        <Field label="Title" value={name} onChange={setName} placeholder="Content title" />
        <Field label="Tagline" value={tagline} onChange={setTagline} placeholder="Punny subtitle" />
        <Field
          label="Body"
          value={body}
          onChange={setBody}
          placeholder="The actual content..."
          multiline
        />

        {/* Genre picker */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5 tracking-wider italic"
            style={{ color: 'var(--cs-crimson-dim)' }}
          >
            Genre
          </label>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.map((g) => (
              <button
                key={g}
                className={`cs-genre-chip ${genre === g ? 'selected' : ''}`}
                onClick={() => setGenre(g)}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Slop rating slider */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5 tracking-wider italic"
            style={{ color: 'var(--cs-crimson-dim)' }}
          >
            Slop Rating
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              value={slopRating}
              onChange={(e) => setSlopRating(Number(e.target.value))}
              className="cs-slop-slider flex-1"
              style={{ accentColor: color }}
            />
            <div className="flex flex-col items-end">
              <span className="text-lg font-mono font-bold" style={{ color }}>
                {slopRating}/10
              </span>
              <span className="text-[10px] italic" style={{ color }}>
                {bloodLabel(slopRating)}
              </span>
            </div>
          </div>
        </div>

        {/* Custom twist */}
        <Field
          label="Add a Dark Twist (optional)"
          value={twist}
          onChange={setTwist}
          placeholder='e.g. "written by a pirate" or "but it rhymes"'
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          className="text-sm px-5 py-2.5 rounded transition-all italic"
          style={{
            color: 'var(--cs-text-dim)',
            border: '1px solid var(--cs-border)',
            background: 'transparent',
            fontFamily: "'Crimson Text', serif",
          }}
          onClick={onBack}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--cs-border-bright)';
            e.currentTarget.style.color = 'var(--cs-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--cs-border)';
            e.currentTarget.style.color = 'var(--cs-text-dim)';
          }}
        >
          Back to the Crypt
        </button>

        <button className="cs-cta" onClick={handleLaunch}>
          <span>UNLEASH REMIXED SLOP</span>
        </button>
      </div>
    </div>
  );
}
