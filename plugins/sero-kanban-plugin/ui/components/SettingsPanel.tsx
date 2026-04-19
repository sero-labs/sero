/**
 * SettingsPanel — slide-over panel for kanban workflow settings.
 *
 * Editable values are runtime-backed through the kanban tool so the UI,
 * extension, and shared state file all flow through the same mutation path.
 */

import { AnimatePresence, motion } from 'motion/react';

import type { KanbanSettings, KanbanState, ReviewMode } from '../../shared/types';
import {
  KANBAN_SETTING_DESCRIPTORS,
  type EditableKanbanSettingKey,
} from '../../shared/settings-descriptor';
import { useKanbanActions } from '../hooks/useKanbanActions';

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  activeColor = 'indigo',
  disabled = false,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  activeColor?: 'indigo' | 'red' | 'amber' | 'emerald' | 'sky';
  disabled?: boolean;
}) {
  const dotColor = enabled ? TOGGLE_COLORS[activeColor] : 'bg-zinc-600';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${disabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-white/[0.03]'}`}
    >
      <div
        className={`relative mt-0.5 h-[18px] w-[34px] shrink-0 rounded-full transition-colors duration-150 ${enabled ? TRACK_COLORS[activeColor] : 'bg-zinc-700/60'}`}
      >
        <div
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full shadow-sm transition-all duration-150 ${enabled ? `right-[2px] left-auto ${dotColor}` : 'left-[2px] bg-zinc-400'}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight text-[var(--kb-text)]">
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--kb-dim)]">
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

function SegmentedPicker<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="px-3 py-2.5">
      <span className="block text-[13px] font-medium leading-tight text-[var(--kb-text)]">
        {label}
      </span>
      <span className="mt-0.5 mb-2.5 block text-[11px] leading-snug text-[var(--kb-dim)]">
        {description}
      </span>
      <div className="flex overflow-hidden rounded-lg border border-[var(--kb-border)] bg-[var(--kb-bg)]">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${disabled ? 'cursor-wait opacity-60' : 'cursor-pointer'} ${value === option.value
              ? 'bg-indigo-500/15 text-[var(--kb-accent)]'
              : 'text-[var(--kb-muted)] hover:bg-white/[0.03] hover:text-[var(--kb-text)]'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
        {children}
      </span>
    </div>
  );
}

function ReadOnlyRow({
  label,
  description,
  value,
}: {
  label: string;
  description: string;
  value: string;
}) {
  return (
    <div className="px-3 py-2.5">
      <span className="block text-[13px] font-medium leading-tight text-[var(--kb-text)]">
        {label}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--kb-dim)]">
        {description}
      </span>
      <div className="mt-2 rounded-lg border border-[var(--kb-border)] bg-[var(--kb-bg)] px-3 py-2 text-[11px] text-[var(--kb-muted)]">
        {value}
      </div>
    </div>
  );
}

function getDescriptor(key: EditableKanbanSettingKey | 'autoAdvance') {
  const descriptor = KANBAN_SETTING_DESCRIPTORS.find((candidate) => candidate.key === key);
  if (!descriptor) {
    throw new Error(`Missing kanban setting descriptor for ${key}`);
  }
  return descriptor;
}

const YOLO_DESCRIPTOR = getDescriptor('yoloMode');
const AUTO_MERGE_DESCRIPTOR = getDescriptor('yoloAutoMergePrs');
const TESTING_DESCRIPTOR = getDescriptor('testingEnabled');
const REVIEW_DESCRIPTOR = getDescriptor('reviewMode');
const AUTO_ADVANCE_DESCRIPTOR = getDescriptor('autoAdvance');

export function SettingsPanel({
  open,
  settings,
  onClose,
  onUpdate: _onUpdate,
}: {
  open: boolean;
  settings: KanbanSettings;
  onClose: () => void;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
}) {
  const {
    updateSetting,
    isSettingPending,
    settingsError,
    clearSettingsError,
  } = useKanbanActions();

  const hasPendingUpdate = isSettingPending('yoloMode')
    || isSettingPending('yoloAutoMergePrs')
    || isSettingPending('testingEnabled')
    || isSettingPending('reviewMode');

  const toggleSetting = <K extends EditableKanbanSettingKey>(key: K, value: KanbanSettings[K]) => {
    if (isSettingPending(key)) {
      return;
    }

    void updateSetting(key, value);
  };

  const setMode = (mode: 'production' | 'prototype') => {
    const testingEnabled = mode === 'production';
    if (settings.testingEnabled === testingEnabled || isSettingPending('testingEnabled')) {
      return;
    }

    void updateSetting('testingEnabled', testingEnabled);
  };

  const setReviewMode = (reviewMode: ReviewMode) => {
    if (settings.reviewMode === reviewMode || isSettingPending('reviewMode')) {
      return;
    }

    void updateSetting('reviewMode', reviewMode);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-30"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

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
            <div className="flex items-center justify-between border-b border-[var(--kb-border)] px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-[var(--kb-text)]">Settings</h2>
                {hasPendingUpdate && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--kb-dim)]">
                    Applying runtime change…
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--kb-dim)] transition-colors hover:bg-white/[0.05] hover:text-[var(--kb-text)]"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-1 kb-scrollbar">
              {settingsError && (
                <div className="mx-3 mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="leading-snug">{settingsError}</p>
                    <button
                      type="button"
                      onClick={clearSettingsError}
                      className="cursor-pointer text-[10px] uppercase tracking-wide text-red-200/80 transition-colors hover:text-red-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              <SectionLabel>Automation</SectionLabel>
              <ToggleRow
                label={YOLO_DESCRIPTOR.label}
                description={YOLO_DESCRIPTOR.description}
                enabled={settings.yoloMode}
                onToggle={() => toggleSetting('yoloMode', !settings.yoloMode)}
                activeColor="red"
                disabled={isSettingPending('yoloMode')}
              />
              {settings.yoloMode && (
                <ToggleRow
                  label={AUTO_MERGE_DESCRIPTOR.label}
                  description={AUTO_MERGE_DESCRIPTOR.description}
                  enabled={settings.yoloAutoMergePrs}
                  onToggle={() => toggleSetting('yoloAutoMergePrs', !settings.yoloAutoMergePrs)}
                  activeColor="amber"
                  disabled={isSettingPending('yoloAutoMergePrs')}
                />
              )}
              <ReadOnlyRow
                label={AUTO_ADVANCE_DESCRIPTOR.label}
                description={AUTO_ADVANCE_DESCRIPTOR.description}
                value={settings.autoAdvance ? 'Enabled by the runtime' : 'Disabled by the runtime'}
              />

              <SectionLabel>Development</SectionLabel>
              <SegmentedPicker
                label="Mode"
                description={TESTING_DESCRIPTOR.description}
                value={settings.testingEnabled ? 'production' : 'prototype'}
                options={[
                  { value: 'production', label: 'Production' },
                  { value: 'prototype', label: 'Prototype' },
                ]}
                onChange={setMode}
                disabled={isSettingPending('testingEnabled')}
              />
              {!settings.testingEnabled && REVIEW_DESCRIPTOR.kind === 'select' && (
                <SegmentedPicker
                  label={REVIEW_DESCRIPTOR.label}
                  description={REVIEW_DESCRIPTOR.description}
                  value={settings.reviewMode}
                  options={[...REVIEW_DESCRIPTOR.options]}
                  onChange={setReviewMode}
                  disabled={isSettingPending('reviewMode')}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
