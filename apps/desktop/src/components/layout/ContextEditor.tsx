import { useState, useMemo, useCallback } from 'react';
import {
  Settings2,
  FileText,
  Wrench,
  Sparkles,
  Save,
  Trash2,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sero/ui/components/ui/dialog';
import { Switch } from '@sero/ui/components/ui/switch';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero/ui/components/ui/select';
import {
  useAllPresets,
  useHasOverrides,
  useEditorState,
  useEditorActions,
} from '@/stores/context-editor';
import {
  ContextSection,
  ToggleRow,
  SavePresetInput,
} from './context-editor-parts';

// ── Main Context Editor Dialog ──────────────────────────────────

export function ContextEditor({ sessionId }: { sessionId: string }) {
  const state = useEditorState();
  const actions = useEditorActions();
  const allPresets = useAllPresets();
  const hasOverrides = useHasOverrides();

  const [showSaveInput, setShowSaveInput] = useState(false);

  const {
    isOpen, availableContext, systemPrompt, disabledTools, disabledSkills,
    allToolsDisabled, allSkillsDisabled, activePresetId, applyError,
  } = state;

  const {
    close, setSystemPrompt, toggleTool, toggleSkill,
    setAllToolsDisabled, setAllSkillsDisabled,
    apply, resetToDefault, loadPreset, savePreset, deletePreset,
  } = actions;

  // Computed: the system prompt text to show in the editor
  const displayedPrompt = systemPrompt ?? availableContext?.systemPrompt ?? '';

  const isToolEnabled = useCallback(
    (toolName: string) => !allToolsDisabled && !disabledTools.has(toolName),
    [allToolsDisabled, disabledTools],
  );

  const isSkillEnabled = useCallback(
    (skillName: string) => !allSkillsDisabled && !disabledSkills.has(skillName),
    [allSkillsDisabled, disabledSkills],
  );

  const enabledToolCount = useMemo(() => {
    if (!availableContext || allToolsDisabled) return 0;
    return availableContext.tools.filter((t) => !disabledTools.has(t.name)).length;
  }, [availableContext, allToolsDisabled, disabledTools]);

  const enabledSkillCount = useMemo(() => {
    if (!availableContext || allSkillsDisabled) return 0;
    return availableContext.skills.filter((s) => !disabledSkills.has(s.name)).length;
  }, [availableContext, allSkillsDisabled, disabledSkills]);

  const handleApplyAndClose = useCallback(async () => {
    const ok = await apply(sessionId);
    if (ok) close();
    // On failure, applyError is set in the store — dialog stays open.
  }, [apply, close, sessionId]);

  const handleSavePreset = useCallback(
    (name: string) => {
      savePreset(name);
      setShowSaveInput(false);
    },
    [savePreset],
  );

  // Active user preset (for the delete button outside the select)
  const activeUserPreset = useMemo(
    () =>
      activePresetId && !activePresetId.startsWith('__')
        ? allPresets.find((p) => p.id === activePresetId) ?? null
        : null,
    [activePresetId, allPresets],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
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
            Configure what is included in the LLM context for this session.
          </DialogDescription>
        </DialogHeader>

        {/* ── Preset Selector ─────────────────────────────── */}
        <PresetBar
          allPresets={allPresets}
          activePresetId={activePresetId}
          activeUserPreset={activeUserPreset}
          hasOverrides={hasOverrides}
          showSaveInput={showSaveInput}
          onPresetChange={loadPreset}
          onDelete={deletePreset}
          onReset={resetToDefault}
          onShowSave={() => setShowSaveInput(true)}
          onSave={handleSavePreset}
          onCancelSave={() => setShowSaveInput(false)}
        />

        {/* ── Loading state ───────────────────────────────── */}
        {!availableContext ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">
              Loading session context...
            </span>
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh] overflow-hidden">
            <div className="min-w-0 space-y-2 pr-2">
              {/* ── System Prompt Section ────────────────── */}
              <ContextSection
                icon={FileText}
                title="System Prompt"
                tint="blue"
                badge={
                  systemPrompt !== null
                    ? (systemPrompt === '' ? 'disabled' : 'modified')
                    : undefined
                }
                badgeVariant={
                  systemPrompt !== null
                    ? (systemPrompt === '' ? 'disabled' : 'modified')
                    : 'default'
                }
                defaultOpen={false}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {systemPrompt !== null
                        ? 'Using custom system prompt'
                        : 'Using default system prompt'}
                    </span>
                    {systemPrompt !== null && (
                      <button
                        onClick={() => setSystemPrompt(null)}
                        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                  <textarea
                    value={displayedPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="h-80 w-full resize-y rounded-md border border-border/30 bg-[var(--bg-base)] p-2 font-mono text-[11px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                    placeholder="Enter system prompt..."
                  />
                </div>
              </ContextSection>

              {/* ── Tools Section ────────────────────────── */}
              <ToolsSection
                tools={availableContext.tools}
                allDisabled={allToolsDisabled}
                enabledCount={enabledToolCount}
                isEnabled={isToolEnabled}
                onToggle={toggleTool}
                onToggleAll={setAllToolsDisabled}
              />

              {/* ── Skills Section ───────────────────────── */}
              <SkillsSection
                skills={availableContext.skills}
                allDisabled={allSkillsDisabled}
                enabledCount={enabledSkillCount}
                isEnabled={isSkillEnabled}
                onToggle={toggleSkill}
                onToggleAll={setAllSkillsDisabled}
              />
            </div>
          </ScrollArea>
        )}

        {/* ── Error banner ────────────────────────────────── */}
        {applyError && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
            <span className="text-[11px] text-red-400">{applyError}</span>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────── */}
        <DialogFooter>
          <button
            onClick={close}
            className="rounded-md border border-border/50 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApplyAndClose}
            disabled={!availableContext}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
          >
            Apply
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Preset Bar (extracted to keep main component readable) ──────

import type { ContextPreset } from '@/types/ipc';

function PresetBar({
  allPresets,
  activePresetId,
  activeUserPreset,
  hasOverrides,
  showSaveInput,
  onPresetChange,
  onDelete,
  onReset,
  onShowSave,
  onSave,
  onCancelSave,
}: {
  allPresets: ContextPreset[];
  activePresetId: string | null;
  activeUserPreset: ContextPreset | null;
  hasOverrides: boolean;
  showSaveInput: boolean;
  onPresetChange: (id: string) => void;
  onDelete: (id: string) => void;
  onReset: () => void;
  onShowSave: () => void;
  onSave: (name: string) => void;
  onCancelSave: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-[var(--text-muted)]">
          Preset:
        </span>
        <Select value={activePresetId ?? ''} onValueChange={onPresetChange}>
          <SelectTrigger size="sm" className="h-7 w-40 text-xs">
            <SelectValue placeholder="Custom" />
          </SelectTrigger>
          <SelectContent>
            {allPresets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Delete button — outside the select, only for user presets */}
        {activeUserPreset && (
          <button
            onClick={() => onDelete(activeUserPreset.id)}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title={`Delete "${activeUserPreset.name}"`}
          >
            <Trash2 className="size-3" />
          </button>
        )}

        {!showSaveInput && (
          <button
            onClick={onShowSave}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <Save className="size-3" />
            Save as
          </button>
        )}

        {hasOverrides && (
          <button
            onClick={onReset}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        )}
      </div>

      {showSaveInput && (
        <SavePresetInput onSave={onSave} onCancel={onCancelSave} />
      )}
    </>
  );
}

// ── Tools Section ──────────────────────────────────────────────

import type { ContextToolInfo, ContextSkillInfo } from '@/types/ipc';

function ToolsSection({
  tools,
  allDisabled,
  enabledCount,
  isEnabled,
  onToggle,
  onToggleAll,
}: {
  tools: ContextToolInfo[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
  onToggle: (name: string) => void;
  onToggleAll: (disabled: boolean) => void;
}) {
  const badgeVariant = allDisabled
    ? 'disabled' as const
    : enabledCount < tools.length
      ? 'partial' as const
      : 'default' as const;

  return (
    <ContextSection
      icon={Wrench}
      title="Tools"
      tint="amber"
      count={tools.length}
      badge={
        allDisabled
          ? 'disabled'
          : enabledCount < tools.length
            ? `${enabledCount}/${tools.length}`
            : undefined
      }
      badgeVariant={badgeVariant}
      defaultOpen={false}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between rounded-md border-b border-border/20 px-2 pb-2 mb-1">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">
            Enable all tools
          </span>
          <Switch
            size="sm"
            checked={!allDisabled}
            onCheckedChange={(checked) => onToggleAll(!checked)}
          />
        </div>

        {tools.map((tool) => (
          <ToggleRow
            key={tool.name}
            name={tool.name}
            description={tool.description}
            enabled={isEnabled(tool.name)}
            onToggle={() => onToggle(tool.name)}
          />
        ))}

        {tools.length === 0 && (
          <span className="text-[11px] text-[var(--text-muted)] italic">
            No tools available
          </span>
        )}
      </div>
    </ContextSection>
  );
}

// ── Skills Section ─────────────────────────────────────────────

function SkillsSection({
  skills,
  allDisabled,
  enabledCount,
  isEnabled,
  onToggle,
  onToggleAll,
}: {
  skills: ContextSkillInfo[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
  onToggle: (name: string) => void;
  onToggleAll: (disabled: boolean) => void;
}) {
  const badgeVariant = allDisabled
    ? 'disabled' as const
    : enabledCount < skills.length
      ? 'partial' as const
      : 'default' as const;

  return (
    <ContextSection
      icon={Sparkles}
      title="Skills"
      tint="violet"
      count={skills.length}
      badge={
        allDisabled
          ? 'disabled'
          : enabledCount < skills.length
            ? `${enabledCount}/${skills.length}`
            : undefined
      }
      badgeVariant={badgeVariant}
      defaultOpen={false}
    >
      <div className="space-y-1">
        {skills.length > 0 && (
          <div className="flex items-center justify-between rounded-md border-b border-border/20 px-2 pb-2 mb-1">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              Enable all skills
            </span>
            <Switch
              size="sm"
              checked={!allDisabled}
              onCheckedChange={(checked) => onToggleAll(!checked)}
            />
          </div>
        )}

        {skills.map((skill) => (
          <ToggleRow
            key={skill.name}
            name={skill.name}
            description={skill.description}
            enabled={isEnabled(skill.name)}
            onToggle={() => onToggle(skill.name)}
          />
        ))}

        {skills.length === 0 && (
          <span className="text-[11px] text-[var(--text-muted)] italic">
            No skills available
          </span>
        )}
      </div>
    </ContextSection>
  );
}
