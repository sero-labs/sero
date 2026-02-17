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
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useContextEditorStore,
  useAllPresets,
  useHasOverrides,
} from '@/stores/context-editor';
import {
  ContextSection,
  ToolRow,
  SkillRow,
  SavePresetInput,
} from './context-editor-parts';

// ── Main Context Editor Dialog ──────────────────────────────────

export function ContextEditor({
  sessionId,
}: {
  sessionId: string;
}) {
  const isOpen = useContextEditorStore((s) => s.isOpen);
  const close = useContextEditorStore((s) => s.close);
  const availableContext = useContextEditorStore((s) => s.availableContext);
  const systemPrompt = useContextEditorStore((s) => s.systemPrompt);
  const disabledTools = useContextEditorStore((s) => s.disabledTools);
  const disabledSkills = useContextEditorStore((s) => s.disabledSkills);
  const allToolsDisabled = useContextEditorStore((s) => s.allToolsDisabled);
  const allSkillsDisabled = useContextEditorStore((s) => s.allSkillsDisabled);
  const activePresetId = useContextEditorStore((s) => s.activePresetId);
  const setSystemPrompt = useContextEditorStore((s) => s.setSystemPrompt);
  const toggleTool = useContextEditorStore((s) => s.toggleTool);
  const toggleSkill = useContextEditorStore((s) => s.toggleSkill);
  const setAllToolsDisabled = useContextEditorStore((s) => s.setAllToolsDisabled);
  const setAllSkillsDisabled = useContextEditorStore((s) => s.setAllSkillsDisabled);
  const apply = useContextEditorStore((s) => s.apply);
  const resetToDefault = useContextEditorStore((s) => s.resetToDefault);
  const loadPreset = useContextEditorStore((s) => s.loadPreset);
  const savePreset = useContextEditorStore((s) => s.savePreset);
  const deletePreset = useContextEditorStore((s) => s.deletePreset);

  const allPresets = useAllPresets();
  const hasOverrides = useHasOverrides();

  const [showSaveInput, setShowSaveInput] = useState(false);

  // Computed: the system prompt text to show in the editor
  const displayedPrompt = systemPrompt ?? availableContext?.systemPrompt ?? '';

  // Computed: enabled state for each tool
  const isToolEnabled = useCallback(
    (toolName: string) => {
      if (allToolsDisabled) return false;
      return !disabledTools.has(toolName);
    },
    [allToolsDisabled, disabledTools],
  );

  const isSkillEnabled = useCallback(
    (skillName: string) => {
      if (allSkillsDisabled) return false;
      return !disabledSkills.has(skillName);
    },
    [allSkillsDisabled, disabledSkills],
  );

  // Count enabled tools/skills
  const enabledToolCount = useMemo(() => {
    if (!availableContext) return 0;
    if (allToolsDisabled) return 0;
    return availableContext.tools.filter((t) => !disabledTools.has(t.name)).length;
  }, [availableContext, allToolsDisabled, disabledTools]);

  const enabledSkillCount = useMemo(() => {
    if (!availableContext) return 0;
    if (allSkillsDisabled) return 0;
    return availableContext.skills.filter((s) => !disabledSkills.has(s.name)).length;
  }, [availableContext, allSkillsDisabled, disabledSkills]);

  const handleApplyAndClose = useCallback(async () => {
    await apply(sessionId);
    close();
  }, [apply, close, sessionId]);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      loadPreset(presetId);
    },
    [loadPreset],
  );

  const handleSavePreset = useCallback(
    (name: string) => {
      savePreset(name);
      setShowSaveInput(false);
    },
    [savePreset],
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      deletePreset(presetId);
    },
    [deletePreset],
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            Preset:
          </span>
          <Select
            value={activePresetId ?? ''}
            onValueChange={handlePresetChange}
          >
            <SelectTrigger size="sm" className="h-7 w-40 text-xs">
              <SelectValue placeholder="Custom" />
            </SelectTrigger>
            <SelectContent>
              {allPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <div className="flex items-center gap-2">
                    <span>{preset.name}</span>
                    {!preset.id.startsWith('__') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePreset(preset.id);
                        }}
                        className="text-[var(--text-muted)] hover:text-red-400"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!showSaveInput ? (
            <button
              onClick={() => setShowSaveInput(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <Save className="size-3" />
              Save as
            </button>
          ) : null}

          {hasOverrides && (
            <button
              onClick={resetToDefault}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>
          )}
        </div>

        {showSaveInput && (
          <SavePresetInput
            onSave={handleSavePreset}
            onCancel={() => setShowSaveInput(false)}
          />
        )}

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
                badge={systemPrompt !== null ? 'modified' : undefined}
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
              <ContextSection
                icon={Wrench}
                title="Tools"
                count={availableContext.tools.length}
                badge={
                  allToolsDisabled
                    ? 'all disabled'
                    : enabledToolCount < availableContext.tools.length
                      ? `${enabledToolCount}/${availableContext.tools.length}`
                      : undefined
                }
                defaultOpen={false}
              >
                <div className="space-y-1">
                  {/* Master toggle */}
                  <div className="flex items-center justify-between border-b border-border/20 pb-2 mb-1">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      Enable all tools
                    </span>
                    <Switch
                      size="sm"
                      checked={!allToolsDisabled}
                      onCheckedChange={(checked) =>
                        setAllToolsDisabled(!checked)
                      }
                    />
                  </div>

                  {/* Individual tool toggles */}
                  {availableContext.tools.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      enabled={isToolEnabled(tool.name)}
                      onToggle={() => toggleTool(tool.name)}
                    />
                  ))}

                  {availableContext.tools.length === 0 && (
                    <span className="text-[11px] text-[var(--text-muted)] italic">
                      No tools available
                    </span>
                  )}
                </div>
              </ContextSection>

              {/* ── Skills Section ───────────────────────── */}
              <ContextSection
                icon={Sparkles}
                title="Skills"
                count={availableContext.skills.length}
                badge={
                  allSkillsDisabled
                    ? 'all disabled'
                    : enabledSkillCount < availableContext.skills.length
                      ? `${enabledSkillCount}/${availableContext.skills.length}`
                      : undefined
                }
                defaultOpen={false}
              >
                <div className="space-y-1">
                  {/* Master toggle */}
                  {availableContext.skills.length > 0 && (
                    <div className="flex items-center justify-between border-b border-border/20 pb-2 mb-1">
                      <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Enable all skills
                      </span>
                      <Switch
                        size="sm"
                        checked={!allSkillsDisabled}
                        onCheckedChange={(checked) =>
                          setAllSkillsDisabled(!checked)
                        }
                      />
                    </div>
                  )}

                  {/* Individual skill toggles */}
                  {availableContext.skills.map((skill) => (
                    <SkillRow
                      key={skill.name}
                      skill={skill}
                      enabled={isSkillEnabled(skill.name)}
                      onToggle={() => toggleSkill(skill.name)}
                    />
                  ))}

                  {availableContext.skills.length === 0 && (
                    <span className="text-[11px] text-[var(--text-muted)] italic">
                      No skills available
                    </span>
                  )}
                </div>
              </ContextSection>
            </div>
          </ScrollArea>
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


