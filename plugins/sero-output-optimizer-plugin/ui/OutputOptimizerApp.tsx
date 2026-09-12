import { useCallback, useEffect, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, Badge, Button, Card, CardContent, Label, Separator, Switch } from '@sero-ai/ui';

import {
  REWRITE_CLASSES,
  REWRITE_CLASS_LABELS,
  reductionPercent,
  type OutputOptimizerState,
  type RewriteClass,
} from '../shared/types';
import { formatByteCount } from './format';
import './styles.css';

function toState(details: Record<string, unknown> | null): OutputOptimizerState | null {
  if (!details || typeof details.config !== 'object' || details.config === null) return null;
  // SAFETY: `details` is the `output_optimizer` tool's own state payload, which
  // always matches `OutputOptimizerState`; the guard above checks its shape.
  return details as unknown as OutputOptimizerState;
}

/**
 * Settings for the output optimizer.
 *
 * The extension owns config, RTK status and session accounting. This surface
 * only reads a snapshot and writes changes through the plugin's own tool.
 */
export function OutputOptimizerApp() {
  const { run } = useAppTools();
  const [state, setState] = useState<OutputOptimizerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = useCallback((details: Record<string, unknown> | null) => {
    const next = toState(details);
    if (next) setState(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await run('output_optimizer', { action: 'state' });
      apply(result.details);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read settings.');
    }
  }, [apply, run]);

  // Loading state is an external tool call, so it belongs in an effect.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(
    async (patch: Record<string, unknown>) => {
      setBusy(true);
      try {
        const result = await run('output_optimizer', { action: 'set', ...patch });
        apply(result.details);
        setError('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save settings.');
      } finally {
        setBusy(false);
      }
    },
    [apply, run],
  );

  const retryRtk = useCallback(async () => {
    setBusy(true);
    try {
      const result = await run('output_optimizer', { action: 'retry' });
      apply(result.details);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retry RTK.');
    } finally {
      setBusy(false);
    }
  }, [apply, run]);

  if (!state) {
    return (
      <div className="p-4 text-sm text-[var(--text-muted)]">
        {error || 'Loading output optimizer settings…'}
      </div>
    );
  }

  const reduction = reductionPercent(state.savings);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-[var(--text-primary)]">Output optimizer</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Reduce shell output that reaches the model. Complete output stays in capture files.
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <ToggleRow
            id="optimizer-enabled"
            label="Enable output optimisation"
            description="Rewrite supported commands through the pinned RTK and compact result output."
            checked={state.config.enabled}
            disabled={busy}
            onChange={(enabled) => void update({ enabled })}
          />
          <Separator />
          <ToggleRow
            id="optimizer-notices"
            label="Show optimisation notices"
            description="Add a short notice to results when output was rewritten or compacted."
            checked={state.config.notices}
            disabled={busy}
            onChange={(notices) => void update({ notices })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--text-primary)]">RTK toolchain</span>
              <span className="text-sm text-[var(--text-secondary)]">
                {state.rtk.version ? `Version ${state.rtk.version}` : 'No verified version'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={state.rtk.state === 'available' ? 'secondary' : 'outline'}>
                {state.rtk.state}
              </Badge>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void retryRtk()}>
                Retry
              </Button>
            </div>
          </div>
          {state.rtk.reason ? (
            <p className="text-sm text-[var(--text-secondary)]">{state.rtk.reason}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <span className="text-sm font-medium text-[var(--text-primary)]">Rewritten command classes</span>
          <p className="text-sm text-[var(--text-secondary)]">
            Turn off one class to run those commands as written without disabling optimisation.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {REWRITE_CLASSES.map((rewriteClass) => (
              <ClassToggle
                key={rewriteClass}
                rewriteClass={rewriteClass}
                checked={state.config.rewriteClasses[rewriteClass]}
                disabled={busy}
                onChange={(value) => void update({ rewriteClasses: { [rewriteClass]: value } })}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <span className="text-sm font-medium text-[var(--text-primary)]">Session savings</span>
          <p className="text-sm text-[var(--text-secondary)]">
            Plugin compaction of captured shell output. This is not RTK filtering or billing savings.
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Metric label="Reduction" value={reduction === null ? '—' : `${reduction.toFixed(1)}%`} />
            <Metric label="Input bytes" value={formatByteCount(state.savings.inputBytes)} />
            <Metric label="Compacted bytes" value={formatByteCount(state.savings.compactedBytes)} />
            <Metric label="Measured calls" value={String(state.savings.measuredCalls)} />
            <Metric label="Unmeasured calls" value={String(state.savings.unmeasuredCalls)} />
            <Metric label="Optimized calls" value={String(state.savings.optimizedCalls)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow(input: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col">
        <Label htmlFor={input.id}>{input.label}</Label>
        <span className="text-sm text-[var(--text-secondary)]">{input.description}</span>
      </div>
      <Switch
        id={input.id}
        checked={input.checked}
        disabled={input.disabled}
        onCheckedChange={input.onChange}
      />
    </div>
  );
}

function ClassToggle(input: {
  rewriteClass: RewriteClass;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded border border-[var(--border-subtle)] px-3 py-2">
      <span className="text-sm text-[var(--text-primary)]">{REWRITE_CLASS_LABELS[input.rewriteClass]}</span>
      <Switch
        checked={input.checked}
        disabled={input.disabled}
        onCheckedChange={input.onChange}
        aria-label={REWRITE_CLASS_LABELS[input.rewriteClass]}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-mono text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

export default OutputOptimizerApp;
