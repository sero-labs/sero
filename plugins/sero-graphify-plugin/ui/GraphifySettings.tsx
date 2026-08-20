import { useState } from 'react';
import {
  Button, Card, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@sero-ai/ui';
import type { GraphifyBackend, GraphifyState } from '../shared/types';
import { formatUsd } from '../shared/pricing';
import { ledgerForDay, utcDay } from '../shared/ledger';

/** Backends Sero can drive, with what actually pays for each. */
const BACKENDS: { id: GraphifyBackend; label: string }[] = [
  { id: 'claude-cli', label: 'Claude Code subscription' },
  { id: 'claude', label: 'Anthropic API' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Moonshot Kimi' },
  { id: 'ollama', label: 'Ollama (local)' },
];

interface Props {
  state: GraphifyState;
  /** Queues a settings change for the runtime; the panel never writes state. */
  onConfigure: (params: Record<string, unknown>) => void;
}

/**
 * The model picker is the gate on every paid build: `settings.model` stays null
 * until it is used, and the indexer refuses to spend while it is null.
 */
export function ModelPicker({ state, onConfigure }: Props) {
  const chosen = state.settings.model;
  const [backend, setBackend] = useState<GraphifyBackend>(chosen?.backend ?? 'claude-cli');
  const [modelId, setModelId] = useState(chosen?.modelId ?? '');

  const suggestions = state.availableModels.filter((model) => model.backend === backend);

  const save = () => {
    if (!modelId.trim()) return;
    onConfigure({ backend, model: modelId.trim() });
  };

  return (
    <Card className="flex flex-col gap-3 border-border/40 p-3">
      <div className="flex flex-col gap-1">
        <Label>Backend</Label>
        <Select value={backend} onValueChange={(value) => setBackend(value as GraphifyBackend)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {BACKENDS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label>Model</Label>
        <Input
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
          placeholder="gpt-5.6-luna"
          list="graphify-model-suggestions"
        />
        {/* Free text as well as the list: a model added after this release must
            still be usable without waiting for a Sero update. */}
        <datalist id="graphify-model-suggestions">
          {suggestions.map((model) => <option key={model.modelId} value={model.modelId}>{model.label}</option>)}
        </datalist>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {backend === 'claude-cli'
            ? 'Runs on your Claude Code plan, not API credit. Set a cheap model — the CLI defaults to Opus.'
            : 'Indexing bills this provider directly.'}
        </span>
        <Button size="sm" onClick={save} disabled={!modelId.trim()}>
          {chosen ? 'Update model' : 'Use this model'}
        </Button>
      </div>
    </Card>
  );
}

export function SpendSettings({ state, onConfigure }: Props) {
  const { settings } = state;
  const caps = settings.caps;
  const spentToday = ledgerForDay(state.spend, utcDay(new Date())).usd;

  return (
    <Card className="flex flex-col gap-3 border-border/40 p-3">
      <div className="grid grid-cols-3 gap-2">
        <NumberField key={`build-${caps.maxCostPerBuildUsd}`} label="Max per build" value={caps.maxCostPerBuildUsd} onCommit={(value) => onConfigure({ maxCostPerBuildUsd: value })} step="0.5" />
        <NumberField key={`day-${caps.maxCostPerDayUsd}`} label="Max per day" value={caps.maxCostPerDayUsd} onCommit={(value) => onConfigure({ maxCostPerDayUsd: value })} step="1" />
        <NumberField key={`files-${caps.maxFilesPerBuild}`} label="Max files" value={caps.maxFilesPerBuild} onCommit={(value) => onConfigure({ maxFilesPerBuild: value })} step="500" />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Spent today</span>
        <span>{formatUsd(spentToday)} of {formatUsd(caps.maxCostPerDayUsd)}</span>
      </div>
    </Card>
  );
}

/**
 * Commits on blur, so a limit is queued once rather than on every keystroke.
 * Keyed on `value` by its caller, so a change the runtime did not apply falls
 * back to the value that is actually in force rather than showing a number
 * nothing is enforcing.
 */
function NumberField({ label, value, onCommit, step }: { label: string; value: number; onCommit: (value: number) => void; step: string }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min="0"
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next) && next >= 0 && next !== value) onCommit(next);
          else setDraft(String(value));
        }}
      />
    </div>
  );
}

