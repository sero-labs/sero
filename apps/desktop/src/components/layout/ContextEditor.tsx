import { useShallow } from 'zustand/react/shallow';
import { ContextEditor as SharedContextEditor } from '@sero-ai/ui/components/context-editor/ContextEditor';
import { useContextEditorStore } from '@/stores/context-editor';

/**
 * Session context editor — thin adapter that feeds the live agent session's
 * context and overrides into the shared @sero-ai/ui ContextEditor. The editor
 * owns all editing state; this wrapper only bridges IPC (apply / presets).
 */
export function ContextEditor({ sessionId }: { sessionId: string }) {
  const { isOpen, availableContext, userPresets, applyError, close, apply, savePreset, deletePreset } =
    useContextEditorStore(
      useShallow((s) => ({
        isOpen: s.isOpen,
        availableContext: s.availableContext,
        userPresets: s.userPresets,
        applyError: s.applyError,
        close: s.close,
        apply: s.apply,
        savePreset: s.savePreset,
        deletePreset: s.deletePreset,
      })),
    );

  return (
    <SharedContextEditor
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      available={availableContext}
      initialOverrides={availableContext?.overrides ?? null}
      presets={userPresets}
      onApply={(overrides) => apply(sessionId, overrides)}
      onSavePreset={(name, preset) => void savePreset(name, preset)}
      onDeletePreset={(id) => void deletePreset(id)}
      applyError={applyError}
      description="Configure what is included in the LLM context for this session. Changes are saved with the session."
    />
  );
}
