import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import {
  useAppContributionSlot,
  type ContributedComponentDescriptor,
} from '@sero-ai/app-runtime';
import { cn } from '@sero-ai/ui/lib/utils';
import { ModelPanel } from './ModelPanel';

export const SERO_MODEL_DEFAULTS_KEY = 'sero-defaults';

interface ModelSettingsPanelProps {
  selectedKey: string;
  onSelect: (key: string) => void;
}

function sortContributions(
  contributions: readonly ContributedComponentDescriptor[],
): ContributedComponentDescriptor[] {
  return contributions.toSorted((left, right) => (
    left.name.localeCompare(right.name) || left.key.localeCompare(right.key)
  ));
}

export function ModelSettingsPanel({ selectedKey, onSelect }: ModelSettingsPanelProps) {
  const slot = useAppContributionSlot('ui.admin.model-settings');
  const contributions = useMemo(
    () => sortContributions(slot.contributions),
    [slot.contributions],
  );
  const selectedContribution = contributions.find((entry) => entry.key === selectedKey);
  const effectiveKey = selectedContribution ? selectedKey : SERO_MODEL_DEFAULTS_KEY;

  if (contributions.length === 0) return <ModelPanel />;

  const tabs = [
    { key: SERO_MODEL_DEFAULTS_KEY, name: 'Sero defaults' },
    ...contributions,
  ];
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
    onSelect(tabs[nextIndex].key);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        role="tablist"
        aria-label="Model settings sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/30 px-3 py-2"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`model-settings-tab-${tab.key}`}
            aria-selected={effectiveKey === tab.key}
            aria-controls="model-settings-panel"
            tabIndex={effectiveKey === tab.key ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors',
              effectiveKey === tab.key
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
            )}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <div
        id="model-settings-panel"
        role="tabpanel"
        aria-labelledby={`model-settings-tab-${effectiveKey}`}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {selectedContribution
          ? slot.mount(selectedContribution.key, {
              loading: (
                <div className="admin-loading flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Loading model settings…
                </div>
              ),
              unavailable: (
                <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
                  Model settings are unavailable.
                </div>
              ),
            })
          : <ModelPanel />}
      </div>
    </div>
  );
}
