/**
 * SettingsPanel — slide-over panel for kanban workflow settings.
 *
 * Form-style layout persisted to KanbanState.settings via updateState.
 * No local/session storage — all values live in the shared state file.
 */

import { AnimatePresence, motion } from 'motion/react';
import type { KanbanSettings, KanbanState } from '../../shared/types';

// ── Toggle row ─────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  activeColor = 'indigo',
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  activeColor?: 'indigo' | 'red' | 'amber' | 'emerald' | 'sky';
}) {
  const dotColor = enabled ? TOGGLE_COLORS[activeColor] : 'bg-zinc-600';

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-start gap-3 w-full text-left rounded-lg px-3 py-2.5
        hover:bg-white/[0.03] transition-colors cursor-pointer group"
    >
      {/* Toggle indicator */}
      <div
        className={`mt-0.5 shrink-0 w-[34px] h-[18px] rounded-full relative transition-colors duration-150
          ${enabled ? TRACK_COLORS[activeColor] : 'bg-zinc-700/60'}`}
      >
        <div
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all duration-150 shadow-sm
            ${enabled ? `right-[2px] left-auto ${dotColor}` : 'left-[2px] bg-zinc-400'}`}
        />
      </div>
      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-[var(--kb-text)] leading-tight">
          {label}
        </span>
        <span className="block text-[11px] text-[var(--kb-dim)] leading-snug mt-0.5">
          {description}
        </span>
      </div>
    </button>
  );
}

const TOGGLE_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-400',
  red: 'bg-red-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  sky: 'bg-sky-400',
};

const TRACK_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-500/30',
  red: 'bg-red-500/30',
  amber: 'bg-amber-500/30',
  emerald: 'bg-emerald-500/30',
  sky: 'bg-sky-500/30',
};

// ── Segmented picker ───────────────────────────────────────

function SegmentedPicker<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <span className="block text-[13px] font-medium text-[var(--kb-text)] leading-tight">
        {label}
      </span>
      <span className="block text-[11px] text-[var(--kb-dim)] leading-snug mt-0.5 mb-2.5">
        {description}
      </span>
      <div className="flex rounded-lg overflow-hidden border border-[var(--kb-border)] bg-[var(--kb-bg)]">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer
              ${value === opt.value
                ? 'bg-indigo-500/15 text-[var(--kb-accent)]'
                : 'text-[var(--kb-muted)] hover:text-[var(--kb-text)] hover:bg-white/[0.03]'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Section divider ────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
        {children}
      </span>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────

export function SettingsPanel({
  open,
  settings,
  onClose,
  onUpdate,
}: {
  open: boolean;
  settings: KanbanSettings;
  onClose: () => void;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
}) {
  const updateSetting = <K extends keyof KanbanSettings>(key: K, value: KanbanSettings[K]) => {
    onUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
    }));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 z-30"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="absolute top-0 right-0 bottom-0 z-40 flex flex-col"
            style={{
              width: 340,
              backgroundColor: 'var(--kb-surface)',
              borderLeft: '1px solid var(--kb-border)',
            }}
            initial={{ x: 340 }}
            animate={{ x: 0 }}
            exit={{ x: 340 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--kb-border)]">
              <h2 className="text-sm font-semibold text-[var(--kb-text)]">Settings</h2>
              <button
                onClick={onClose}
                className="text-[var(--kb-dim)] hover:text-[var(--kb-text)] transition-colors
                  w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.05] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto kb-scrollbar px-2 py-1">
              {/* ── Automation ── */}
              <SectionLabel>Automation</SectionLabel>
              <ToggleRow
                label="🔥 YOLO Mode"
                description="Auto-start, auto-approve, and auto-complete cards with no human gates."
                enabled={settings.yoloMode}
                onToggle={() => {
                  onUpdate((prev) => ({
                    ...prev,
                    settings: {
                      ...prev.settings,
                      yoloMode: !prev.settings.yoloMode,
                      // Disable auto-merge when YOLO is turned off
                      yoloAutoMergePrs: prev.settings.yoloMode ? false : prev.settings.yoloAutoMergePrs,
                    },
                  }));
                }}
                activeColor="red"
              />
              {settings.yoloMode && (
                <ToggleRow
                  label="PR Auto-Merge"
                  description="Automatically queue GitHub auto-merge after PR creation."
                  enabled={settings.yoloAutoMergePrs}
                  onToggle={() => updateSetting('yoloAutoMergePrs', !settings.yoloAutoMergePrs)}
                  activeColor="amber"
                />
              )}

              {/* ── Development ── */}
              <SectionLabel>Development</SectionLabel>
              <SegmentedPicker
                label="Mode"
                description="Production enables TDD and test generation. Prototype skips tests for fast iteration."
                value={settings.testingEnabled ? 'production' : 'prototype'}
                options={[
                  { value: 'production', label: 'Production' },
                  { value: 'prototype', label: 'Prototype' },
                ]}
                onChange={(v) => {
                  onUpdate((prev) => ({
                    ...prev,
                    settings: {
                      ...prev.settings,
                      testingEnabled: v === 'production',
                      // Reset review mode to full when switching to production
                      reviewMode: v === 'production' ? 'full' : prev.settings.reviewMode,
                    },
                  }));
                }}
              />
              {!settings.testingEnabled && (
                <SegmentedPicker
                  label="Review Level"
                  description="Light review runs compile/build checks only. Full keeps the standard diff review pass."
                  value={settings.reviewMode}
                  options={[
                    { value: 'full', label: 'Full' },
                    { value: 'light', label: 'Light' },
                  ]}
                  onChange={(v) => updateSetting('reviewMode', v)}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
