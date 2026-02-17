import { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRight,
  Settings2,
  FileText,
  Wrench,
  Sparkles,
  Save,
  Trash2,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import type { ContextToolInfo, ContextSkillInfo } from '@/types/ipc';

// ── Collapsible Section (ToolCallGroup style) ───────────────────

function ContextSection({
  icon: Icon,
  title,
  count,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors duration-200',
        'border-border/50 bg-[var(--bg-elevated)]/50',
      )}
    >
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150',
          'hover:bg-[var(--bg-elevated)]/80',
        )}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        </motion.div>

        <Icon className="size-3.5 text-[var(--text-muted)]" />

        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {title}
        </span>

        {count !== undefined && (
          <span className="text-[11px] text-[var(--text-muted)]">
            ({count})
          </span>
        )}

        {badge && (
          <span className="ml-auto rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 p-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Tool Toggle Row ─────────────────────────────────────────────

function ToolRow({
  tool,
  enabled,
  onToggle,
}: {
  tool: ContextToolInfo;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-[var(--text-secondary)]">
          {tool.name}
        </div>
        {tool.description && (
          <div className="truncate text-[10px] text-[var(--text-muted)]/60">
            {tool.description}
          </div>
        )}
      </div>
      <Switch
        size="sm"
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

// ── Skill Toggle Row ────────────────────────────────────────────

function SkillRow({
  skill,
  enabled,
  onToggle,
}: {
  skill: ContextSkillInfo;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-[var(--text-secondary)]">
          {skill.name}
        </div>
        {skill.description && (
          <div className="truncate text-[10px] text-[var(--text-muted)]/60">
            {skill.description}
          </div>
        )}
      </div>
      <Switch
        size="sm"
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

// ── Save Preset Dialog ──────────────────────────────────────────

function SavePresetInput({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name..."
        className="flex-1 rounded-md border border-border/50 bg-[var(--bg-base)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim());
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        onClick={() => name.trim() && onSave(name.trim())}
        disabled={!name.trim()}
        className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        Cancel
      </button>
    </div>
  );
}

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
        className="max-h-[85vh] bg-[var(--bg-surface)] sm:max-w-xl"
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
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2 pr-2">
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
                    className="h-40 w-full resize-y rounded-md border border-border/30 bg-[var(--bg-base)] p-2 font-mono text-[11px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
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

// ── Context Editor Trigger Button ───────────────────────────────

/**
 * Small icon button that opens the context editor.
 * Only renders when the session is new (no messages).
 */
export function ContextEditorTrigger({
  sessionId,
  hasMessages,
  disabled,
}: {
  sessionId: string;
  hasMessages: boolean;
  disabled?: boolean;
}) {
  const openEditor = useContextEditorStore((s) => s.open);
  const hasOverrides = useHasOverrides();

  // Only show for new sessions (no messages yet)
  if (hasMessages) return null;

  return (
    <button
      onClick={() => openEditor(sessionId)}
      disabled={disabled}
      title="Edit session context"
      className={cn(
        'relative rounded-md p-1 transition-colors',
        'hover:bg-[var(--bg-elevated)] disabled:opacity-50 disabled:cursor-not-allowed',
        hasOverrides
          ? 'text-[var(--accent)]'
          : 'text-[var(--text-muted)]',
      )}
    >
      <Settings2 className="size-3.5" />
      {hasOverrides && (
        <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-[var(--accent)]" />
      )}
    </button>
  );
}
