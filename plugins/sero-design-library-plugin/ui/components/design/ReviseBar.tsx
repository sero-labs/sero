import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { RevisionBehaviour } from '../../../shared/settings';

/**
 * Asking for a change to the variant on screen (spec §6.4).
 *
 * The choice beside the box is the one the spec requires the revise to ask:
 * whether the result replaces what is on screen or joins it. It is a control
 * rather than a dialog because it is answered every time — and it remembers,
 * through the generation default in Settings, so the answer is usually already
 * right.
 */

export interface ReviseBarProps {
  /** Disabled while there is nothing to revise, or while the variant is working. */
  disabled: boolean;
  behaviour: RevisionBehaviour;
  /** What is already being changed, when a revise is queued or running. */
  pending: string | undefined;
  onBehaviour(behaviour: RevisionBehaviour): void;
  onRevise(instruction: string): void;
}

export function ReviseBar({
  disabled,
  behaviour,
  pending,
  onBehaviour,
  onRevise,
}: ReviseBarProps) {
  const [instruction, setInstruction] = useState('');

  const submit = () => {
    const trimmed = instruction.trim();
    if (trimmed === '' || disabled) return;
    onRevise(trimmed);
    setInstruction('');
  };

  if (pending !== undefined) {
    return (
      <div className="border-border text-muted-foreground flex items-center gap-2 border-t px-3 py-2 text-sm">
        <Sparkles className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Revising: {pending}</span>
      </div>
    );
  }

  return (
    <div className="border-border flex items-center gap-2 border-t px-3 py-2">
      <Input
        value={instruction}
        placeholder="Ask for a change to this variant…"
        className="h-8 min-w-0 flex-1"
        disabled={disabled}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />

      <Select value={behaviour} onValueChange={(value) => onBehaviour(value as RevisionBehaviour)}>
        <SelectTrigger size="sm" className="w-36" aria-label="What happens to this result">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* What happens to the result on screen, said from its point of view:
              the new one is always what you end up looking at. */}
          <SelectItem value="replace">Replace it</SelectItem>
          <SelectItem value="retain">Keep both</SelectItem>
        </SelectContent>
      </Select>

      <Button type="button" size="sm" disabled={disabled || instruction.trim() === ''} onClick={submit}>
        Revise
        <Sparkles className="size-3.5" />
      </Button>
    </div>
  );
}
