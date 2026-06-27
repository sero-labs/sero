/**
 * ContextEditor — shared, controlled context editor dialog.
 *
 * Edits a system prompt plus tool/skill enablement and saved presets, against
 * an `available` context. Host-agnostic: the consumer supplies the available
 * context, the current overrides, the preset list, and the persistence
 * callbacks. Used by the desktop chat session editor and by app modules (e.g.
 * the Orchestrator loop context override).
 */

import { useState } from 'react';
import { AlertCircle, Loader2, Settings2 } from 'lucide-react';
import type { AvailableContext, ContextOverrides, ContextPreset } from '@sero-ai/common';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { PresetBar } from './PresetBar';
import { SkillsSection } from './SkillsSection';
import { SystemPromptSection, type SystemPromptCopy } from './SystemPromptSection';
import { ToolsSection } from './ToolsSection';
import { useContextEditorModel, type ContextPresetBody } from './use-context-editor-model';

export interface ContextEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: AvailableContext | null;
  initialOverrides: ContextOverrides | null;
  presets: ContextPreset[];
  /** Persist the chosen overrides. Return false to keep the dialog open (error). */
  onApply: (overrides: ContextOverrides | null) => Promise<boolean> | boolean;
  onSavePreset: (name: string, preset: ContextPresetBody) => void;
  onDeletePreset: (id: string) => void;
  applyError?: string | null;
  title?: string;
  description?: string;
  systemPromptCopy?: SystemPromptCopy;
  applyLabel?: string;
}

export function ContextEditor({
  open,
  onOpenChange,
  available,
  initialOverrides,
  presets,
  onApply,
  onSavePreset,
  onDeletePreset,
  applyError,
  title = 'Context Editor',
  description = 'Configure what is included in the LLM context.',
  systemPromptCopy,
  applyLabel = 'Apply',
}: ContextEditorProps) {
  const model = useContextEditorModel({ open, available, initialOverrides, presets, onSavePreset, onDeletePreset });
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    try {
      const ok = await onApply(model.buildOverrides());
      if (ok !== false) onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-hidden bg-[var(--bg-surface)] sm:max-w-[58rem]"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="size-4 text-[var(--text-muted)]" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        <PresetBar {...model.preset} />

        {!available ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">Loading context…</span>
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh] overflow-hidden">
            <div className="min-w-0 space-y-2 pr-2">
              <SystemPromptSection
                displayedPrompt={model.displayedPrompt}
                systemPrompt={model.systemPrompt}
                onSystemPromptChange={model.setSystemPrompt}
                copy={systemPromptCopy}
              />
              <ToolsSection {...model.tools} />
              <SkillsSection {...model.skills} />
            </div>
          </ScrollArea>
        )}

        {applyError && (
          <div className="flex items-start gap-2 rounded-md border border-status-error-border bg-status-error-muted px-3 py-2">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-status-error" />
            <span className="text-[11px] text-status-error">{applyError}</span>
          </div>
        )}

        <DialogFooter>
          <button type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border/50 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
          >
            Cancel
          </button>
          <button type="button"
            onClick={() => { void handleApply(); }}
            disabled={!available || applying}
            className="rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {applyLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
