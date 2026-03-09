/**
 * ModifierChips — compact chip selector for modifiers.
 *
 * Modifiers layer additional constraints on top of selected styles.
 * Custom modifiers persist in state.
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
import type { Modifier } from '../../shared/types';

interface ModifierChipsProps {
  activeIds: Set<string>;
  allModifiers: Modifier[];
  onToggle: (id: string) => void;
  onAddCustom: (modifier: Modifier) => void;
  onRemoveCustom: (id: string) => void;
}

export function ModifierChips({
  activeIds,
  allModifiers,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: ModifierChipsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  const handleSave = () => {
    const label = newLabel.trim();
    const prompt = newPrompt.trim();
    if (!label || !prompt) return;

    const id = `custom-mod-${Date.now()}`;
    onAddCustom({ id, label, prompt, builtIn: false });
    setNewLabel('');
    setNewPrompt('');
    setDialogOpen(false);
    onToggle(id);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[10px] font-medium tracking-wider uppercase text-muted-foreground/25">
        Modifiers
      </span>

      {allModifiers.map((mod) => {
        const isActive = activeIds.has(mod.id);
        return (
          <button
            key={mod.id}
            type="button"
            onClick={() => onToggle(mod.id)}
            className={cn(
              'humanizer-chip',
              'inline-flex items-center gap-1 rounded-md',
              'px-2 py-0.5 text-[11px] font-medium',
              'border transition-all duration-200',
              'select-none',
              isActive
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300/80'
                : [
                    'border-border/20 text-muted-foreground/35',
                    'hover:border-border/40 hover:text-muted-foreground/60',
                  ],
            )}
          >
            {mod.label}
            {!mod.builtIn && (
              <button
                type="button"
                className={cn(
                  'ml-0.5 border-none bg-transparent p-0 text-[10px] leading-none',
                  'cursor-pointer transition-colors',
                  isActive
                    ? 'text-indigo-400/40 hover:text-indigo-300'
                    : 'text-muted-foreground/20 hover:text-destructive',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveCustom(mod.id);
                }}
              >
                ×
              </button>
            )}
          </button>
        );
      })}

      {/* Add custom modifier */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className={cn(
          'humanizer-chip',
          'inline-flex items-center gap-1 rounded-md',
          'border border-dashed border-border/20',
          'px-1.5 py-0.5 text-[10px] text-muted-foreground/25',
          'transition-all hover:border-indigo-500/25 hover:text-indigo-400/50',
        )}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Modifier
      </button>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New modifier</DialogTitle>
            <DialogDescription>
              Add a reusable constraint that layers on top of any style.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. First person"
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Instructions
              </label>
              <Textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="e.g. Always write in first person. Use 'I' and 'me'."
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
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

// Keep old export name for backwards compat if anything imports it
export { ModifierChips as InstructionPresets };
