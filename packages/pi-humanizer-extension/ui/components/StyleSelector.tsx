/**
 * StyleSelector — visual style picker with emoji chips and active preview.
 *
 * Styles are grouped by category. Selecting multiple blends their voices.
 * The active style description is shown prominently when one style is selected.
 * When multiple are selected, a "blending" indicator appears.
 */

import { useState, useMemo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sero-ai/ui/components/ui/dialog';
import type { Style, StyleCategory } from '../../shared/types';
import { STYLE_CATEGORIES } from '../lib/styles';

/** Tailwind color classes for each style color key. */
const COLOR_MAP: Record<string, { active: string; glow: string }> = {
  emerald: {
    active: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]',
  },
  violet: {
    active: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
    glow: 'shadow-[0_0_12px_rgba(139,92,246,0.15)]',
  },
  blue: {
    active: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
    glow: 'shadow-[0_0_12px_rgba(59,130,246,0.15)]',
  },
  amber: {
    active: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    glow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]',
  },
  red: {
    active: 'border-red-500/40 bg-red-500/15 text-red-300',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.15)]',
  },
  slate: {
    active: 'border-slate-400/40 bg-slate-500/15 text-slate-300',
    glow: 'shadow-[0_0_12px_rgba(148,163,184,0.15)]',
  },
  orange: {
    active: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
    glow: 'shadow-[0_0_12px_rgba(249,115,22,0.15)]',
  },
  indigo: {
    active: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
    glow: 'shadow-[0_0_12px_rgba(99,102,241,0.15)]',
  },
  cyan: {
    active: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
    glow: 'shadow-[0_0_12px_rgba(6,182,212,0.15)]',
  },
  rose: {
    active: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.15)]',
  },
  yellow: {
    active: 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300',
    glow: 'shadow-[0_0_12px_rgba(234,179,8,0.15)]',
  },
};

const DEFAULT_COLOR = COLOR_MAP.indigo;

function getColorClasses(color: string) {
  return COLOR_MAP[color] ?? DEFAULT_COLOR;
}

// ── Chip for a single style ────────────────────────────────

function StyleChip({
  style,
  isActive,
  onToggle,
  onRemove,
}: {
  style: Style;
  isActive: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const colors = getColorClasses(style.color);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'humanizer-chip',
        'inline-flex items-center gap-1.5 rounded-lg',
        'px-2.5 py-1 text-xs font-medium',
        'border transition-all duration-200',
        'select-none',
        isActive
          ? [colors.active, colors.glow]
          : [
              'border-border/30 text-muted-foreground/50',
              'hover:border-border/60 hover:text-muted-foreground/80',
              'hover:bg-white/[0.02]',
            ],
      )}
    >
      <span className="text-[13px] leading-none">{style.emoji}</span>
      {style.label}
      {onRemove && (
        <button
          type="button"
          className={cn(
            'ml-0.5 border-none bg-transparent p-0 text-[10px] leading-none',
            'cursor-pointer transition-colors',
            isActive
              ? 'text-current opacity-50 hover:opacity-80'
              : 'text-muted-foreground/30 hover:text-destructive',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </button>
  );
}

// ── Active style info bar ──────────────────────────────────

function ActiveStyleInfo({ styles }: { styles: Style[] }) {
  if (styles.length === 0) return null;

  const firstColor = getColorClasses(styles[0].color);

  if (styles.length === 1) {
    return (
      <div
        className={cn(
          'rounded-lg px-3 py-2',
          'border border-current/10 bg-current/[0.04]',
          firstColor.active.split(' ').find((c) => c.startsWith('text-')),
        )}
      >
        <p className="text-[12px] leading-relaxed opacity-80">
          {styles[0].description}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/[0.04] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[12px] text-indigo-300/80">
        <span className="text-[13px]">✦</span>
        <span>
          Blending{' '}
          {styles.map((s, i) => (
            <span key={s.id}>
              <span className="font-medium">{s.label}</span>
              {i < styles.length - 1 && <span className="opacity-40"> + </span>}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

interface StyleSelectorProps {
  activeIds: Set<string>;
  allStyles: Style[];
  onToggle: (id: string) => void;
  onAddCustom: (style: Style) => void;
  onRemoveCustom: (id: string) => void;
}

export function StyleSelector({
  activeIds,
  allStyles,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: StyleSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('✨');
  const [newDesc, setNewDesc] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newCategory, setNewCategory] = useState<StyleCategory>('creative');

  const activeStyles = useMemo(
    () => allStyles.filter((s) => activeIds.has(s.id)),
    [allStyles, activeIds],
  );

  // Group styles by category
  const grouped = useMemo(() => {
    const groups = new Map<StyleCategory, Style[]>();
    for (const cat of STYLE_CATEGORIES) {
      const items = allStyles.filter((s) => s.category === cat.id);
      if (items.length > 0) groups.set(cat.id, items);
    }
    return groups;
  }, [allStyles]);

  const handleSave = () => {
    const label = newLabel.trim();
    const prompt = newPrompt.trim();
    if (!label || !prompt) return;

    const id = `custom-${Date.now()}`;
    onAddCustom({
      id,
      label,
      description: newDesc.trim() || label,
      emoji: newEmoji.trim() || '✨',
      category: newCategory,
      prompt,
      builtIn: false,
      color: 'indigo',
    });
    setNewLabel('');
    setNewEmoji('✨');
    setNewDesc('');
    setNewPrompt('');
    setNewCategory('creative');
    setDialogOpen(false);
    onToggle(id);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Style chips grouped by category */}
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from(grouped.entries()).map(([catId, styles], gi) => (
          <span key={catId} className="contents">
            {gi > 0 && (
              <span className="mx-0.5 h-4 w-px bg-border/20" />
            )}
            {styles.map((style) => (
              <StyleChip
                key={style.id}
                style={style}
                isActive={activeIds.has(style.id)}
                onToggle={() => onToggle(style.id)}
                onRemove={!style.builtIn ? () => onRemoveCustom(style.id) : undefined}
              />
            ))}
          </span>
        ))}

        {/* Add custom style */}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={cn(
            'humanizer-chip',
            'inline-flex items-center gap-1 rounded-lg',
            'border border-dashed border-border/30',
            'px-2 py-1 text-[11px] text-muted-foreground/30',
            'transition-all hover:border-violet-500/30 hover:text-violet-400/60',
          )}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Style
        </button>
      </div>

      {/* Active style info */}
      <ActiveStyleInfo styles={activeStyles} />

      {/* Create custom style dialog */}
      <CreateStyleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        label={newLabel}
        emoji={newEmoji}
        desc={newDesc}
        prompt={newPrompt}
        category={newCategory}
        onLabelChange={setNewLabel}
        onEmojiChange={setNewEmoji}
        onDescChange={setNewDesc}
        onPromptChange={setNewPrompt}
        onCategoryChange={setNewCategory}
        onSave={handleSave}
      />
    </div>
  );
}

// ── Create style dialog ────────────────────────────────────

function CreateStyleDialog({
  open,
  onOpenChange,
  label,
  emoji,
  desc,
  prompt,
  category,
  onLabelChange,
  onEmojiChange,
  onDescChange,
  onPromptChange,
  onCategoryChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  emoji: string;
  desc: string;
  prompt: string;
  category: StyleCategory;
  onLabelChange: (v: string) => void;
  onEmojiChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  onCategoryChange: (v: StyleCategory) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New writing style</DialogTitle>
          <DialogDescription>
            Create a custom style — a creative persona the AI will adopt when
            transforming your text.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Emoji
              </label>
              <Input
                value={emoji}
                onChange={(e) => onEmojiChange(e.target.value)}
                className="h-8 w-16 text-center"
                maxLength={4}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={label}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="e.g. Pirate Captain"
                className="h-8"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Short description
            </label>
            <Input
              value={desc}
              onChange={(e) => onDescChange(e.target.value)}
              placeholder="e.g. Salty, weathered, full of nautical metaphors"
              className="h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Voice instructions
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Describe how this persona writes. Be specific about tone, vocabulary, structure, and references…"
              className="min-h-[100px] resize-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <div className="flex gap-1.5">
              {STYLE_CATEGORIES.filter((c) => c.id !== 'core').map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onCategoryChange(cat.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition-colors',
                    category === cat.id
                      ? 'bg-violet-500/15 text-violet-300'
                      : 'text-muted-foreground/50 hover:text-muted-foreground',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!label.trim() || !prompt.trim()}
            className="bg-violet-600 text-white hover:bg-violet-500"
          >
            Create style
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
