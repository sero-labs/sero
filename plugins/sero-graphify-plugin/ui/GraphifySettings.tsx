import { useState } from 'react';
import {
  Button, Card, Input, Label, Switch,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@sero-ai/ui';
import type { GraphifyBackend, GraphifyState, ModelChoice } from '../shared/types';
import { formatUsd } from '../shared/pricing';

/** Backends Sero can drive, with what actually pays for each. */
const BACKENDS: { id: GraphifyBackend; label: string }[] = [
  { id: 'claude-cli', label: 'Claude Code subscription' },
  { id: 'claude', label: 'Anthropic API' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Moonshot Kimi' },
  { id: 'azure', label: 'Azure OpenAI' },
  { id: 'bedrock', label: 'AWS Bedrock' },
  { id: 'ollama', label: 'Ollama (local)' },
];

interface Props {
  state: GraphifyState;
  onChange: (update: (settings: GraphifyState['settings']) => GraphifyState['settings']) => void;
}

/**
 * The model picker is the gate on every paid build: `settings.model` stays null
 * until it is used, and the indexer refuses to spend while it is null.
 */
export function ModelPicker({ state, onChange }: Props) {
  const chosen = state.settings.model;
  const [backend, setBackend] = useState<GraphifyBackend>(chosen?.backend ?? 'claude-cli');
  const [modelId, setModelId] = useState(chosen?.modelId ?? '');

  const suggestions = state.availableModels.filter((model) => model.backend === backend);

  const save = () => {
    if (!modelId.trim()) return;
    const choice: ModelChoice = { backend, modelId: modelId.trim(), chosenAt: new Date().toISOString() };
    onChange((settings) => ({ ...settings, model: choice }));
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

export function SpendSettings({ state, onChange }: Props) {
  const { settings } = state;
  const caps = settings.caps;
  const setCap = (key: keyof typeof caps, value: number) =>
    onChange((current) => ({ ...current, caps: { ...current.caps, [key]: value } }));

  return (
    <Card className="flex flex-col gap-3 border-border/40 p-3">
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Max per build" value={caps.maxCostPerBuildUsd} onChange={(value) => setCap('maxCostPerBuildUsd', value)} step="0.5" />
        <NumberField label="Max per day" value={caps.maxCostPerDayUsd} onChange={(value) => setCap('maxCostPerDayUsd', value)} step="1" />
        <NumberField label="Max files" value={caps.maxFilesPerBuild} onChange={(value) => setCap('maxFilesPerBuild', value)} step="500" />
      </div>

      <ToggleRow
        label="Name communities with the model"
        checked={settings.nameCommunities}
        onChange={(checked) => onChange((current) => ({ ...current, nameCommunities: checked }))}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Spent today</span>
        <span>{formatUsd(state.spend.usd)} of {formatUsd(caps.maxCostPerDayUsd)}</span>
      </div>
    </Card>
  );
}

function NumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (value: number) => void; step: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
