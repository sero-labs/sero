/**
 * LoopContextControl — optional, user-level context override for a loop.
 *
 * Reuses the shared @sero-ai/ui ContextEditor (the same one the chat session
 * editor uses) to author custom instructions plus disabled tools/skills for the
 * loop's background subagents, or to pick a saved preset. Applied via the
 * `set_loop_context` action; never touched by the planner.
 */

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import type { ContextPreset } from '@sero-ai/common';
import { useSubagentContext, useContextPresets } from '@sero-ai/app-runtime';
import { ContextEditor } from '@sero-ai/ui/components/context-editor/ContextEditor';
import type { Loop, OrchestratorAction } from '../../shared/types';

const LOOP_PROMPT_COPY = {
  title: 'System Prompt',
  defaultHint: 'Using the default Sero system prompt',
  emptyHint: 'Base system prompt excluded for this loop',
  customHint: 'Using a custom system prompt for this loop',
  placeholder: 'Type to replace the default Sero system prompt for this loop…',
  footnote:
    "Leave blank to use the default, empty to exclude it, or type to replace it. The orchestrator's step rules always still apply.",
};

function LoopContextDialog({
  loop,
  onAction,
  open,
  onOpenChange,
}: {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { context } = useSubagentContext(loop.workspaceId);
  const { presets, save } = useContextPresets();

  return (
    <ContextEditor
      open={open}
      onOpenChange={onOpenChange}
      available={context}
      initialOverrides={loop.contextOverrides ?? null}
      presets={presets}
      onApply={(overrides) => {
        onAction({ kind: 'set_loop_context', loopId: loop.id, overrides });
        return true;
      }}
      onSavePreset={(name, body) => {
        const next: ContextPreset = { id: `user-${Date.now()}`, name, ...body };
        void save([...presets, next]);
      }}
      onDeletePreset={(id) => void save(presets.filter((p) => p.id !== id))}
      title="Loop context"
      description="System prompt and skills for this loop's background subagents. Tools are chosen per step in the plan."
      systemPromptCopy={LOOP_PROMPT_COPY}
      applyLabel="Save context"
      hideTools
    />
  );
}

export function LoopContextControl({
  loop,
  onAction,
}: {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!loop.contextOverrides;

  return (
    <>
      <button type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Context
        {active && <span className="ml-0.5 size-1.5 rounded-full bg-[var(--accent-primary)]" />}
      </button>
      {open && (
        <LoopContextDialog loop={loop} onAction={onAction} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}
