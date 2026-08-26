import { useMemo, useState } from 'react';
import type { ModelThinkingLevel, ThinkingLevelMap } from '@earendil-works/pi-ai';
import { ArrowLeft } from 'lucide-react';
import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
import type { LocalModelEntry, LocalThinkingFormat } from '@/types/local-models';
import { LocalProviderField } from './LocalProviderField';

interface LocalModelEditorProps {
  model: LocalModelEntry;
  thinkingFormat: LocalThinkingFormat;
  onCancel: () => void;
  onSave: (model: LocalModelEntry) => void;
}

const THINKING_LEVELS: ReadonlyArray<{
  value: Exclude<ModelThinkingLevel, 'off'>;
  label: string;
}> = [
  { value: 'minimal', label: 'Min' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'X-High' },
  { value: 'max', label: 'Max' },
];

const COMMON_PROVIDER_VALUES = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

function suggestedThinkingMap(format: LocalThinkingFormat): ThinkingLevelMap {
  if (format !== 'qwen-chat-template') {
    return {
      off: 'off',
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    };
  }
  return {
    off: 'off',
    minimal: 'low',
    low: 'low',
    medium: 'medium',
    high: 'xhigh',
    xhigh: 'xhigh',
    max: null,
  };
}

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function LocalModelEditor({
  model,
  thinkingFormat,
  onCancel,
  onSave,
}: LocalModelEditorProps) {
  const [name, setName] = useState(model.name ?? model.id);
  const [reasoning, setReasoning] = useState(model.reasoning ?? false);
  const [thinkingLevelMap, setThinkingLevelMap] = useState<ThinkingLevelMap>(
    {
      ...suggestedThinkingMap(thinkingFormat),
      ...model.thinkingLevelMap,
    },
  );
  const [contextWindow, setContextWindow] = useState(
    model.contextWindow?.toString() ?? '',
  );
  const [maxTokens, setMaxTokens] = useState(model.maxTokens?.toString() ?? '');
  const [supportsText, setSupportsText] = useState(model.input?.includes('text') ?? true);
  const [supportsImage, setSupportsImage] = useState(model.input?.includes('image') ?? false);

  const requestFormatLabel = useMemo(() => {
    if (thinkingFormat === 'qwen-chat-template') return 'Qwen chat template';
    return thinkingFormat;
  }, [thinkingFormat]);

  const updateThinkingLevel = (
    level: Exclude<ModelThinkingLevel, 'off'>,
    value: string,
  ) => {
    setThinkingLevelMap((current) => ({
      ...current,
      [level]: value === 'disabled' ? null : value,
    }));
  };

  const handleSave = () => {
    const input: ('text' | 'image')[] = [];
    if (supportsText) input.push('text');
    if (supportsImage) input.push('image');
    onSave({
      ...model,
      name: name.trim() || model.id,
      reasoning,
      thinkingLevelMap,
      contextWindow: parsePositiveInteger(contextWindow),
      maxTokens: parsePositiveInteger(maxTokens),
      input,
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]
            hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Edit Model</h3>
          <p className="text-sm text-[var(--text-muted)]">Local provider</p>
        </div>
      </div>

      <LocalProviderField label="Model ID">
        <input
          aria-label="Model ID"
          value={model.id}
          disabled
          className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2.5 text-xs text-[var(--text-muted)] opacity-70"
        />
      </LocalProviderField>

      <LocalProviderField label="Display Name">
        <input
          aria-label="Display name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2.5 text-xs text-[var(--text-primary)] outline-none
            focus:border-[var(--border-focus)]"
        />
      </LocalProviderField>

      <label className="flex items-center justify-between gap-3 rounded-lg border
        border-[var(--border-subtle)] p-3"
      >
        <span>
          <span className="block text-xs font-medium text-[var(--text-primary)]">
            Thinking support
          </span>
          <span className="text-sm text-[var(--text-muted)]">
            Mark this model as reasoning-capable.
          </span>
        </span>
        <Checkbox
          checked={reasoning}
          onCheckedChange={(checked) => setReasoning(checked === true)}
        />
      </label>

      {reasoning ? (
        <LocalProviderField
          label="Thinking-Level Mapping"
          hint={`Request format: ${requestFormatLabel}`}
        >
          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <div className="grid grid-cols-[90px_1fr] gap-2 bg-[var(--bg-elevated)] px-3 py-2
              text-sm text-[var(--text-muted)]"
            >
              <span>Sero level</span>
              <span>Provider value</span>
            </div>
            <div className="grid grid-cols-[90px_1fr] items-center gap-2 border-t
              border-[var(--border-subtle)] px-3 py-2"
            >
              <span className="text-xs text-[var(--text-secondary)]">Off</span>
              <span className="text-sm text-[var(--text-muted)]">Thinking disabled</span>
            </div>
            {THINKING_LEVELS.map(({ value, label }) => {
              const mappedValue = thinkingLevelMap[value];
              const selectValue = mappedValue ?? 'disabled';
              const hasCustomValue = typeof mappedValue === 'string'
                && !COMMON_PROVIDER_VALUES.includes(
                  mappedValue as (typeof COMMON_PROVIDER_VALUES)[number],
                );
              return (
                <div
                  key={value}
                  className="grid grid-cols-[90px_1fr] items-center gap-2 border-t
                    border-[var(--border-subtle)] px-3 py-1.5"
                >
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  <select
                    aria-label={`${label} provider value`}
                    value={selectValue}
                    onChange={(event) => updateThinkingLevel(value, event.target.value)}
                    className="h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
                      px-2 text-xs text-[var(--text-primary)] outline-none
                      focus:border-[var(--border-focus)]"
                  >
                    <option value="disabled">Disabled</option>
                    {hasCustomValue ? <option value={mappedValue}>{mappedValue}</option> : null}
                    {COMMON_PROVIDER_VALUES.map((providerValue) => (
                      <option key={providerValue} value={providerValue}>{providerValue}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </LocalProviderField>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <LocalProviderField label="Context Window">
          <input
            aria-label="Context window"
            type="number"
            min="1"
            value={contextWindow}
            onChange={(event) => setContextWindow(event.target.value)}
            className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
              px-2.5 text-xs outline-none focus:border-[var(--border-focus)]"
          />
        </LocalProviderField>
        <LocalProviderField label="Maximum Output Tokens">
          <input
            aria-label="Maximum output tokens"
            type="number"
            min="1"
            value={maxTokens}
            onChange={(event) => setMaxTokens(event.target.value)}
            className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
              px-2.5 text-xs outline-none focus:border-[var(--border-focus)]"
          />
        </LocalProviderField>
      </div>

      <LocalProviderField label="Input Support">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Checkbox
              checked={supportsText}
              onCheckedChange={(checked) => setSupportsText(checked === true)}
            />
            Text
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Checkbox
              checked={supportsImage}
              onCheckedChange={(checked) => setSupportsImage(checked === true)}
            />
            Images
          </label>
        </div>
      </LocalProviderField>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-xs
          text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
        >
          Cancel
        </button>
        <button type="button" onClick={handleSave} className="h-8 rounded-md bg-[var(--accent-primary)]
          px-3 text-xs font-medium text-white hover:opacity-90"
        >
          Save Model
        </button>
      </div>
    </div>
  );
}
