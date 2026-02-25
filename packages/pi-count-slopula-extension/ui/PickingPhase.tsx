/**
 * PickingPhase — displays 3 generated content pieces as gothic scroll cards.
 *
 * Each card shows the content name, tagline, body preview, genre,
 * and a "blood meter" rating. User can build, remix, or save each piece.
 */

import type { ContentPiece } from '../shared/types';

// ── Blood meter gradient color ──────────────────────────────

function bloodColor(rating: number): string {
  if (rating <= 3) return 'var(--cs-ghost)';
  if (rating <= 6) return 'var(--cs-gold)';
  return 'var(--cs-crimson)';
}

function bloodLabel(rating: number): string {
  if (rating <= 2) return 'Mild Nibble';
  if (rating <= 4) return 'Getting Bitey';
  if (rating <= 6) return 'Deep Bite';
  if (rating <= 8) return 'Full Drain';
  return 'TRANSCENDENT SLOP';
}

// ── Content Card ──────────────────────────────────────────────

function ContentCard({
  piece,
  index,
  onPick,
  onRemix,
  onSave,
  isSaved,
}: {
  piece: ContentPiece;
  index: number;
  onPick: (piece: ContentPiece) => void;
  onRemix: (piece: ContentPiece) => void;
  onSave: (piece: ContentPiece) => void;
  isSaved: boolean;
}) {
  const animClass = `cs-card-enter-${index + 1}`;
  const color = bloodColor(piece.slopRating);

  return (
    <div
      className={`cs-content-card ${animClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onPick(piece)}
      onKeyDown={(e) => e.key === 'Enter' && onPick(piece)}
    >
      {/* Card number badge */}
      <div
        className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
        style={{
          background: 'var(--cs-crimson-subtle)',
          color: 'var(--cs-crimson)',
          border: '1px solid var(--cs-border)',
        }}
      >
        {index + 1}
      </div>

      {/* Genre tag */}
      <div
        className="inline-block text-[10px] italic px-2 py-0.5 rounded mb-2"
        style={{
          background: 'var(--cs-purple-glow)',
          color: 'var(--cs-ghost)',
          border: '1px solid rgba(107, 33, 168, 0.3)',
        }}
      >
        {piece.genre}
      </div>

      {/* Name & tagline */}
      <h3
        className="cs-vampire-text text-lg mb-1 pr-10"
        style={{ color: 'var(--cs-crimson)' }}
      >
        {piece.name}
      </h3>
      <p className="text-sm italic mb-3" style={{ color: 'var(--cs-text-dim)' }}>
        &ldquo;{piece.tagline}&rdquo;
      </p>

      {/* Body preview */}
      <p className="text-sm leading-relaxed mb-4 line-clamp-4" style={{ color: 'var(--cs-text)' }}>
        {piece.body}
      </p>

      {/* Blood meter */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium italic" style={{ color }}>
            {bloodLabel(piece.slopRating)}
          </span>
          <span className="text-xs font-mono" style={{ color }}>
            {piece.slopRating}/10
          </span>
        </div>
        <div className="cs-blood-meter">
          <div
            className="cs-blood-fill"
            style={{
              width: `${piece.slopRating * 10}%`,
              background: `linear-gradient(90deg, var(--cs-purple), ${color})`,
            }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center justify-between pt-3"
        style={{ borderTop: '1px solid var(--cs-border)' }}
      >
        {/* Save for later */}
        <button
          className="text-xs font-medium tracking-wider px-3 py-1.5 rounded transition-all"
          style={{
            color: isSaved ? 'var(--cs-gold)' : 'var(--cs-text-dim)',
            border: `1px solid ${isSaved ? 'var(--cs-gold)' : 'var(--cs-border)'}`,
            background: isSaved ? 'var(--cs-gold-glow)' : 'transparent',
            fontFamily: "'Crimson Text', serif",
            fontStyle: 'italic',
          }}
          onClick={(e) => { e.stopPropagation(); onSave(piece); }}
          onMouseEnter={(e) => {
            if (!isSaved) {
              e.currentTarget.style.borderColor = 'var(--cs-gold)';
              e.currentTarget.style.color = 'var(--cs-gold)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSaved) {
              e.currentTarget.style.borderColor = 'var(--cs-border)';
              e.currentTarget.style.color = 'var(--cs-text-dim)';
            }
          }}
        >
          {isSaved ? '~ Entombed' : '~ Entomb'}
        </button>

        <div className="flex gap-2">
          {/* Remix */}
          <button
            className="text-xs font-medium tracking-wider px-3 py-1.5 rounded transition-all italic"
            style={{
              color: 'var(--cs-ghost)',
              border: '1px solid var(--cs-ghost)',
              background: 'rgba(201, 177, 255, 0.06)',
              fontFamily: "'Crimson Text', serif",
            }}
            onClick={(e) => { e.stopPropagation(); onRemix(piece); }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 12px var(--cs-purple-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Remix
          </button>

          {/* Build */}
          <button
            className="text-xs font-medium tracking-wider px-3 py-1.5 rounded transition-all"
            style={{
              color: 'var(--cs-crimson)',
              border: '1px solid var(--cs-crimson)',
              background: 'var(--cs-crimson-subtle)',
              fontFamily: "'Creepster', fantasy",
              letterSpacing: '0.05em',
            }}
            onClick={(e) => { e.stopPropagation(); onPick(piece); }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 12px var(--cs-crimson-glow)';
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
  pieces: ContentPiece[];
  onPick: (piece: ContentPiece) => void;
  onRemix: (piece: ContentPiece) => void;
  onSave: (piece: ContentPiece) => void;
  savedPieceNames: Set<string>;
  onRegenerate: () => void;
}

export function PickingPhase({
  pieces,
  onPick,
  onRemix,
  onSave,
  savedPieceNames,
  onRegenerate,
}: PickingPhaseProps) {
  return (
    <div className="flex flex-col items-center px-6 py-8 relative z-10">
      {/* Header */}
      <div className="text-center mb-8">
        <h2
          className="cs-vampire-text text-2xl mb-2"
          style={{ color: 'var(--cs-crimson)' }}
        >
          CHOOSE YOUR SLOP
        </h2>
        <p className="text-sm italic" style={{ color: 'var(--cs-text-dim)' }}>
          The Count has summoned 3 pieces from the crypt. Build one, remix it, or entomb it for later.
        </p>
      </div>

      {/* Content cards */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {pieces.map((piece, i) => (
          <ContentCard
            key={piece.id}
            piece={piece}
            index={i}
            onPick={onPick}
            onRemix={onRemix}
            onSave={onSave}
            isSaved={savedPieceNames.has(piece.name)}
          />
        ))}
      </div>

      {/* Regenerate */}
      <button
        className="text-xs font-medium tracking-wider px-4 py-2 rounded transition-all italic"
        style={{
          color: 'var(--cs-text-dim)',
          border: '1px solid var(--cs-border)',
          background: 'transparent',
          fontFamily: "'Crimson Text', serif",
        }}
        onClick={onRegenerate}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--cs-border-bright)';
          e.currentTarget.style.color = 'var(--cs-crimson)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--cs-border)';
          e.currentTarget.style.color = 'var(--cs-text-dim)';
        }}
      >
        Not cliched enough? Summon again...
      </button>
    </div>
  );
}
