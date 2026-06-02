/**
 * ThemeEditorSheet, full live theme editor in a right-side sheet.
 *
 * Separate from ThemePanel (which handles preset browsing/selection).
 * This editor lets users customise every token, colours, typography,
 * spacing, and radius, with instant live preview. Changes are applied
 * to the DOM in real-time via the theme engine; Save persists to disk.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@sero-ai/ui/components/ui/sheet';
import { XIcon } from 'lucide-react';
import { ThemeEditorDetailsSection } from './theme-editor/ThemeEditorDetailsSection';
import { ThemeEditorFooter } from './theme-editor/ThemeEditorFooter';
import { ThemeEditorTabs } from './theme-editor/ThemeEditorTabs';
import { useThemeEditorState } from './theme-editor/useThemeEditorState';

interface ThemeEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, load this preset into the editor on open. */
  editPresetId?: string | null;
}

export function ThemeEditorSheet({
  open,
  onOpenChange,
  editPresetId,
}: ThemeEditorSheetProps) {
  const {
    currentColors,
    autoSave,
    draft,
    editPresetId: activeEditPresetId,
    effectiveMode,
    handleCancel,
    handleColorChange,
    handleDraftDescriptionChange,
    handleDraftNameChange,
    handleNewTheme,
    handleRadiusChange,
    handleReset,
    handleSave,
    handleSpacingChange,
    handleTypographyChange,
    mode,
    setAutoSave,
    setMode,
    setTab,
    tab,
  } = useThemeEditorState({ open, onOpenChange, editPresetId });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
        }
      }}
      modal={false}
    >
      <SheetContent
        side="right"
        overlay={false}
        className="flex w-[420px] max-w-[90vw] flex-col gap-0 overflow-hidden border-l border-[var(--border-default)] p-0 shadow-2xl sm:max-w-[420px]"
        showCloseButton={false}
      >
        <SheetHeader className="shrink-0 flex flex-row items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div>
            <SheetTitle className="text-sm">Theme Editor</SheetTitle>
            <SheetDescription className="sr-only">
              Create or edit a theme preset with live preview
            </SheetDescription>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleNewTheme}
              className="rounded px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              + New
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close theme editor</span>
            </button>
          </div>
        </SheetHeader>

        {draft && (
          <>
            <ThemeEditorDetailsSection
              draft={draft}
              onNameChange={handleDraftNameChange}
              onDescriptionChange={handleDraftDescriptionChange}
            />
            <ThemeEditorTabs
              currentColors={currentColors}
              draft={draft}
              effectiveMode={effectiveMode}
              mode={mode}
              onColorChange={handleColorChange}
              onModeChange={setMode}
              onRadiusChange={handleRadiusChange}
              onSpacingChange={handleSpacingChange}
              onTabChange={setTab}
              onTypographyChange={handleTypographyChange}
              tab={tab}
            />
            <ThemeEditorFooter
              canReset={Boolean(activeEditPresetId && activeEditPresetId !== '__new__')}
              canSave={Boolean(draft.name.trim())}
              autoSave={autoSave}
              onCancel={handleCancel}
              onAutoSaveChange={setAutoSave}
              onReset={handleReset}
              onSave={handleSave}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
