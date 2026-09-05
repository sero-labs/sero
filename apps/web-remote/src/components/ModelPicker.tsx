/**
 * Model chip for the composer.
 *
 * One popover holds the model list and the thinking control, the same
 * arrangement as the desktop composer. The list itself is the shared
 * `ModelPickerBody`, so the phone and the desktop show one list, not two
 * copies of it.
 *
 * Provider logos are hidden here. They are remote `models.dev` URLs, and
 * a phone reaching the desktop over the local network may have no way out
 * to the internet.
 */

import { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { THINKING_LABELS, type ThinkingLevel } from '@sero-ai/common';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { ModelPickerBody } from '@sero-ai/ui/model-selection/model-picker-body';
import { ThinkingPicker } from '@sero-ai/ui/model-selection/thinking-picker';
import { useModelsStore, type SessionModel } from '@/stores/models';

/** `provider/modelId`, the key both the body and the store speak. */
function modelValue(model: SessionModel): string {
  return `${model.provider}/${model.modelId}`;
}

/** The thinking badge on the chip. Off and non-thinking models show none. */
function thinkingBadge(model: SessionModel): string | null {
  if (!model.reasoning) return null;
  if (model.thinkingLevel === 'off') return null;
  return THINKING_LABELS[model.thinkingLevel as ThinkingLevel] ?? null;
}

export function ModelPicker({
  workspaceId,
  sessionId,
  disabled,
}: {
  workspaceId: string | null;
  sessionId: string | null;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const model = useModelsStore((s) => (sessionId ? s.bySession[sessionId] : undefined));
  const selectModel = useModelsStore((s) => s.selectModel);
  const selectThinking = useModelsStore((s) => s.selectThinking);

  const handleModelChange = useCallback(
    (value: string) => {
      if (!workspaceId || !sessionId) return;
      const separator = value.indexOf('/');
      if (separator < 1) return;
      selectModel(workspaceId, sessionId, value.slice(0, separator), value.slice(separator + 1));
      setOpen(false);
    },
    [selectModel, sessionId, workspaceId],
  );

  const handleThinkingChange = useCallback(
    (level: string) => {
      if (!workspaceId || !sessionId) return;
      selectThinking(workspaceId, sessionId, level);
    },
    [selectThinking, sessionId, workspaceId],
  );

  // Before the host answers there is nothing true to show, so the chip
  // stays out of the way rather than guessing a model name.
  if (!model) return null;

  const badge = thinkingBadge(model);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Change model"
          data-testid="model-picker"
          className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="max-w-[140px] truncate font-medium">{model.name}</span>
          {badge ? (
            <span className="rounded-full bg-status-warning-subtle px-1.5 py-px text-sm font-semibold text-status-warning">
              {badge}
            </span>
          ) : null}
          <ChevronDown className="size-3 text-[var(--text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(340px,calc(100vw-1rem))] overflow-hidden rounded-xl p-0 shadow-2xl"
        onWheel={(event) => event.stopPropagation()}
      >
        <ModelPickerBody
          groups={model.availableModels}
          value={modelValue(model)}
          onChange={handleModelChange}
          // A phone would cover the list with its keyboard.
          autoFocusSearch={false}
          showProviderLogos={false}
          listClassName="max-h-[min(320px,45vh)]"
          noModelsLabel="No models available"
        />

        <ThinkingPicker
          current={model.thinkingLevel}
          available={model.availableThinkingLevels}
          disabled={!model.reasoning}
          onSelect={handleThinkingChange}
          className="border-t"
        />
      </PopoverContent>
    </Popover>
  );
}
