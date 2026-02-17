import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Check, Brain, Zap, Sparkles, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAgentStore, useFocusedAgent } from '@/stores/agent';
import {
  THINKING_LEVELS,
  THINKING_LABELS,
  findModel,
  findGroup,
  type ThinkingLevel,
} from './model-config';
import type { ModelInfo, AvailableModelGroup } from '@/types/ipc';

// ── Trigger Button ─────────────────────────────────────────────

function ModelTrigger({ disabled }: { disabled: boolean }) {
  const focused = useFocusedAgent();
  const ms = focused?.modelState;
  const groups = ms?.availableModels ?? [];

  const model = ms ? findModel(groups, ms.model.provider, ms.model.modelId) : null;
  const group = ms ? findGroup(groups, ms.model.provider, ms.model.modelId) : null;
  const label = model?.name ?? ms?.model.name ?? 'Select model';
  const thinking = ms?.thinkingLevel ?? 'off';

  return (
    <PopoverTrigger asChild disabled={disabled}>
      <button
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs
          text-[var(--text-secondary)] transition-all duration-150
          hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]
          disabled:pointer-events-none disabled:opacity-40"
      >
        {group && (
          <img src={group.logo} alt={group.displayName}
            className="size-3.5 rounded-sm dark:invert" />
        )}
        <span className="max-w-[140px] truncate font-medium">{label}</span>
        {thinking !== 'off' && ms?.model.reasoning && (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {THINKING_LABELS[thinking] ?? thinking}
          </span>
        )}
        <ChevronDown className="size-3 text-[var(--text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </button>
    </PopoverTrigger>
  );
}

// ── Thinking Level Picker ──────────────────────────────────────

function ThinkingPicker({
  current, available, supportsXhigh, disabled, onSelect,
}: {
  current: string; available: string[]; supportsXhigh: boolean;
  disabled: boolean; onSelect: (level: string) => void;
}) {
  // When disabled, show the full set so the layout stays stable
  const levels = disabled
    ? THINKING_LEVELS
    : THINKING_LEVELS.filter(
        (l) => l === 'off' || available.includes(l) || (l === 'xhigh' && supportsXhigh),
      );
  const activeIdx = levels.indexOf((disabled ? 'off' : current) as ThinkingLevel);

  return (
    <div className={`flex flex-col gap-1.5 border-t border-[var(--border-subtle)] px-3 py-2.5 transition-opacity duration-150 ${
      disabled ? 'opacity-35 pointer-events-none' : ''
    }`}>
      <div className="flex items-center gap-1.5">
        <Brain className="size-3 text-[var(--text-muted)]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Thinking
        </span>
      </div>
      <div className="relative flex rounded-lg bg-[var(--bg-base)] p-0.5">
        <motion.div
          className="absolute inset-y-0.5 rounded-md"
          initial={false}
          animate={{
            x: `${activeIdx * 100}%`,
            width: `${100 / levels.length}%`,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          style={{
            background: disabled || current === 'off' ? 'var(--bg-elevated)'
              : current === 'xhigh' ? 'linear-gradient(135deg, #f59e0b33, #ef444433)'
              : 'linear-gradient(135deg, #6366f133, #8b5cf633)',
          }}
        />
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => onSelect(level)}
            className={`relative z-10 flex-1 rounded-md px-1 py-1 text-[11px] font-medium transition-colors duration-150 ${
              current === level && !disabled
                ? level === 'xhigh' ? 'text-amber-600 dark:text-amber-300'
                  : level === 'off' ? 'text-[var(--text-secondary)]'
                  : 'text-indigo-600 dark:text-indigo-300'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {THINKING_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Model Item ─────────────────────────────────────────────────

function ModelItem({ model, isSelected, onSelect }: {
  model: ModelInfo; isSelected: boolean; onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100 ${
        isSelected
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-primary)]'
      }`}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex size-4 shrink-0 items-center justify-center">
        <AnimatePresence mode="wait">
          {isSelected ? (
            <motion.div key="check"
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            </motion.div>
          ) : (
            <motion.div key="dot"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="size-1.5 rounded-full bg-[var(--border-default)] transition-colors group-hover:bg-[var(--text-muted)]" />
          )}
        </AnimatePresence>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-xs font-medium">{model.name}</span>
        {model.reasoning && <Sparkles className="size-3 shrink-0 text-amber-500/60 dark:text-amber-400/60" />}
      </div>
    </motion.button>
  );
}

// ── Provider Group ─────────────────────────────────────────────

function ProviderSection({ group, selectedModel, onSelect }: {
  group: AvailableModelGroup;
  selectedModel: { provider: string; modelId: string } | null;
  onSelect: (model: ModelInfo) => void;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
        <img src={group.logo} alt={group.displayName}
          className="size-3.5 rounded-sm dark:invert" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {group.displayName}
        </span>
      </div>
      <div className="px-1">
        {group.models.map((model) => (
          <ModelItem
            key={`${model.provider}/${model.modelId}`}
            model={model}
            isSelected={
              selectedModel?.provider === model.provider &&
              selectedModel?.modelId === model.modelId
            }
            onSelect={() => onSelect(model)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

/** Filter groups by search query, matching on model name or model ID. */
function filterGroups(groups: AvailableModelGroup[], query: string): AvailableModelGroup[] {
  if (!query) return groups;
  const q = query.toLowerCase();
  const filtered: AvailableModelGroup[] = [];
  for (const group of groups) {
    const matches = group.models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q),
    );
    if (matches.length) filtered.push({ ...group, models: matches });
  }
  return filtered;
}

export function ModelSelector({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const focused = useFocusedAgent();
  const setModel = useAgentStore((s) => s.setModel);
  const setThinkingLevel = useAgentStore((s) => s.setThinkingLevel);

  const sessionId = focused?.sessionId ?? null;
  const ms = focused?.modelState;
  const groups = ms?.availableModels ?? [];
  const selectedModel = ms ? { provider: ms.model.provider, modelId: ms.model.modelId } : null;

  const filteredGroups = useMemo(() => filterGroups(groups, filter), [groups, filter]);
  const totalFiltered = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.models.length, 0),
    [filteredGroups],
  );

  // Reset filter & autofocus when popover opens
  useEffect(() => {
    if (open) {
      setFilter('');
      // Small delay so popover is rendered before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleModelSelect = useCallback(
    (model: ModelInfo) => {
      if (!sessionId) return;
      setModel(sessionId, model.provider, model.modelId);
    },
    [sessionId, setModel],
  );

  const handleThinkingSelect = useCallback(
    (level: string) => {
      if (!sessionId) return;
      setThinkingLevel(sessionId, level);
    },
    [sessionId, setThinkingLevel],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ModelTrigger disabled={disabled} />
      <PopoverContent side="top" align="start" sideOffset={8}
        className="w-[300px] overflow-hidden rounded-xl border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0 shadow-2xl shadow-black/40">
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25, mass: 0.8 }}>

          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3">
            <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search models…"
              data-slot="model-filter"
              className="h-9 w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none"
            />
          </div>

          {/* Model List */}
          <div className="max-h-[320px] overflow-y-auto py-1">
            {groups.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                No models available. Run <code className="rounded bg-[var(--bg-muted)] px-1 font-mono">pi auth</code> to add a provider.
              </div>
            ) : totalFiltered === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                No models matching "<span className="text-[var(--text-secondary)]">{filter}</span>"
              </div>
            ) : (
              filteredGroups.map((group, i) => (
                <div key={group.provider}>
                  {i > 0 && <div className="mx-3 border-t border-[var(--border-subtle)]" />}
                  <ProviderSection
                    group={group}
                    selectedModel={selectedModel}
                    onSelect={handleModelSelect}
                  />
                </div>
              ))
            )}
          </div>

          {/* Thinking Level Picker — always shown, disabled when model has no reasoning */}
          <ThinkingPicker
            current={ms?.thinkingLevel ?? 'off'}
            available={ms?.availableThinkingLevels ?? []}
            supportsXhigh={ms?.supportsXhigh ?? false}
            disabled={!ms?.model.reasoning}
            onSelect={handleThinkingSelect}
          />
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
