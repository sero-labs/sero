import { AlertCircle, Loader2, Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { PresetBar } from './context-editor/PresetBar';
import { SkillsSection } from './context-editor/SkillsSection';
import { SystemPromptSection } from './context-editor/SystemPromptSection';
import { ToolsSection } from './context-editor/ToolsSection';
import { useContextEditorState } from './context-editor/useContextEditorState';

export function ContextEditor({ sessionId }: { sessionId: string }) {
  const state = useContextEditorState(sessionId);

  return (
    <Dialog open={state.isOpen} onOpenChange={(open) => !open && state.close()}>
      <DialogContent
        className="max-h-[85vh] overflow-hidden bg-[var(--bg-surface)] sm:max-w-[58rem]"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="size-4 text-[var(--text-muted)]" />
            Context Editor
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure what is included in the LLM context for this session. Changes are saved with the session.
          </DialogDescription>
        </DialogHeader>

        <PresetBar {...state.preset} />

        {!state.availableContext ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">
              Loading session context…
            </span>
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh] overflow-hidden">
            <div className="min-w-0 space-y-2 pr-2">
              <SystemPromptSection
                displayedPrompt={state.displayedPrompt}
                systemPrompt={state.systemPrompt}
                onSystemPromptChange={state.setSystemPrompt}
              />
              <ToolsSection
                tools={state.tools.items}
                allDisabled={state.tools.allDisabled}
                enabledCount={state.tools.enabledCount}
                isEnabled={state.tools.isEnabled}
                onToggle={state.tools.onToggle}
                onToggleAll={state.tools.onToggleAll}
              />
              <SkillsSection
                skills={state.skills.items}
                allDisabled={state.skills.allDisabled}
                enabledCount={state.skills.enabledCount}
                isEnabled={state.skills.isEnabled}
                onToggle={state.skills.onToggle}
                onToggleAll={state.skills.onToggleAll}
              />
            </div>
          </ScrollArea>
        )}

        {state.applyError && (
          <div className="flex items-start gap-2 rounded-md border border-status-error-border bg-status-error-muted px-3 py-2">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-status-error" />
            <span className="text-[11px] text-status-error">{state.applyError}</span>
          </div>
        )}

        <DialogFooter>
          <button type="button"
            onClick={state.close}
            className="rounded-md border border-border/50 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
          >
            Cancel
          </button>
          <button type="button"
            onClick={() => {
              void state.handleApplyAndClose();
            }}
            disabled={!state.availableContext}
            className="rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            Apply
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
