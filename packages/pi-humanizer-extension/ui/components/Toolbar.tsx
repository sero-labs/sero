/**
 * Toolbar — styles, modifiers, and action button bar.
 *
 * Wrapped in React.memo — during streaming, none of the toolbar's
 * props change (all callbacks are useCallback-stable, loading/hasInput
 * are constant once streaming starts).
 */

import { memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import type { Style, Modifier } from '../../shared/types';
import { StyleSelector } from './StyleSelector';
import { ModifierChips } from './InstructionPresets';
import { LoadingSpinner } from './EditorPanes';

interface ToolbarProps {
  allStyles: Style[];
  allModifiers: Modifier[];
  activeStyleIds: Set<string>;
  activeModifierIds: Set<string>;
  onToggleStyle: (id: string) => void;
  onAddCustomStyle: (style: Style) => void;
  onRemoveCustomStyle: (id: string) => void;
  onToggleModifier: (id: string) => void;
  onAddCustomModifier: (modifier: Modifier) => void;
  onRemoveCustomModifier: (id: string) => void;
  hasInput: boolean;
  loading: boolean;
  actionLabel: string;
  onTransform: () => void;
  onClear: () => void;
  error: string | null;
}

export const Toolbar = memo(function Toolbar({
  allStyles,
  allModifiers,
  activeStyleIds,
  activeModifierIds,
  onToggleStyle,
  onAddCustomStyle,
  onRemoveCustomStyle,
  onToggleModifier,
  onAddCustomModifier,
  onRemoveCustomModifier,
  hasInput,
  loading,
  actionLabel,
  onTransform,
  onClear,
  error,
}: ToolbarProps) {
  return (
    <div className="vt-toolbar flex flex-col gap-2 border-b border-border/40 px-4 py-3">
      {/* Styles row */}
      <StyleSelector
        activeIds={activeStyleIds}
        allStyles={allStyles}
        onToggle={onToggleStyle}
        onAddCustom={onAddCustomStyle}
        onRemoveCustom={onRemoveCustomStyle}
      />

      {/* Modifiers + action button row */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ModifierChips
            activeIds={activeModifierIds}
            allModifiers={allModifiers}
            onToggle={onToggleModifier}
            onAddCustom={onAddCustomModifier}
            onRemoveCustom={onRemoveCustomModifier}
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {hasInput && !loading && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-muted-foreground"
            >
              Clear
            </button>
          )}
          <Button
            size="sm"
            disabled={!hasInput || loading}
            onClick={onTransform}
            className={cn(
              'humanizer-button',
              'h-8 rounded-lg px-5 text-xs font-medium',
              'bg-emerald-600 text-white hover:bg-emerald-500',
              'transition-all duration-200',
              !loading && hasInput && 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner />
                Working…
              </span>
            ) : (
              actionLabel
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
});
