/**
 * InstructionPresets — bold chip selector with emerald/indigo accents.
 *
 * Active chips glow with color. The active instructions description
 * is prominent and readable, not ghost text. Custom presets persist in state.
 */

import { useState } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import { Input } from '@sero/ui/components/ui/input';
import { Textarea } from '@sero/ui/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sero/ui/components/ui/dialog';
import type { InstructionPreset } from '../../shared/types';

interface InstructionPresetsProps {
  activeIds: Set<string>;
  allPresets: InstructionPreset[];
  onToggle: (id: string) => void;
  onAddCustom: (preset: InstructionPreset) => void;
  onRemoveCustom: (id: string) => void;
}

export function InstructionPresets({
  activeIds,
  allPresets,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: InstructionPresetsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  const activePresets = allPresets.filter((p) => activeIds.has(p.id));

  const handleSave = () => {
    const label = newLabel.trim();
    const prompt = newPrompt.trim();
    if (!label || !prompt) return;

    const id = `custom-${Date.now()}`;
    onAddCustom({ id, label, prompt, builtIn: false });
    setNewLabel('');
    setNewPrompt('');
    setDialogOpen(false);
    onToggle(id);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Chips row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {allPresets.map((preset) => {
          const isActive = activeIds.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onToggle(preset.id)}
              className={cn(
                'humanizer-chip',
                'inline-flex items-center gap-1 rounded-lg',
                'px-2.5 py-1 text-xs font-medium',
                'border transition-all duration-200',
                'select-none',
                isActive
                  ? [
                      'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
                      'shadow-[0_0_12px_rgba(99,102,241,0.15)]',
                    ]
                  : [
                      'border-border/30 text-muted-foreground/50',
                      'hover:border-border/60 hover:text-muted-foreground/80',
                      'hover:bg-white/[0.02]',
                    ],
              )}
            >
              {preset.label}
              {!preset.builtIn && (
                <button
                  type="button"
                  className={cn(
                    'ml-0.5 bg-transparent border-none p-0 text-[10px] leading-none transition-colors cursor-pointer',
                    isActive
                      ? 'text-indigo-400/50 hover:text-indigo-300'
                      : 'text-muted-foreground/30 hover:text-destructive',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCustom(preset.id);
                  }}
                >
                  ×
                </button>
              )}
            </button>
          );
        })}

        {/* Add custom */}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={cn(
            'humanizer-chip',
            'inline-flex items-center gap-1 rounded-lg',
            'border border-dashed border-border/30',
            'px-2 py-1 text-[11px] text-muted-foreground/30',
            'transition-all hover:border-indigo-500/30 hover:text-indigo-400/60',
          )}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Custom
        </button>
      </div>

      {/* Active instructions — bold and readable */}
      {activePresets.length > 0 && (
        <div
          className={cn(
            'rounded-lg px-3 py-2',
            'border border-indigo-500/15 bg-indigo-500/[0.06]',
          )}
        >
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
            {activePresets.map((p, i) => (
              <span key={p.id} className="text-[12.5px] leading-relaxed text-indigo-300/90">
                {p.prompt}
                {i < activePresets.length - 1 && (
                  <span className="text-indigo-500/30"> · </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New instruction preset</DialogTitle>
            <DialogDescription>
              Create a reusable style to apply to any humanization.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Blog post"
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Instructions</label>
              <Textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="e.g. Write in a warm, personal blog style. Use first person."
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!newLabel.trim() || !newPrompt.trim()}
              className="bg-indigo-600 text-white hover:bg-indigo-500"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
