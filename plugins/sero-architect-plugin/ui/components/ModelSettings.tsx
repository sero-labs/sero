import { useAvailableModels } from '@sero-ai/app-runtime';
import { MODEL_TIERS, modelKey, type ModelTier, type SharedModelTierSettings, type ThinkingLevel } from '@sero-ai/common';
import { Button } from '@sero-ai/ui';
import { useEffect, useState } from 'react';

import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';

/**
 * Project model defaults (spec architect-model-overrides).
 *
 * One row per tier. A tier without an override inherits the global selection,
 * and clearing it restores that inheritance. The effective model, its thinking
 * level and the source are always shown, so a tier label never stands in for
 * the model that will actually run.
 */
export function ModelSettings({ record, actions, onBack }: {
  record: ProjectRecord;
  actions: ArchitectActions;
  onBack(): void;
}) {
  const { groups } = useAvailableModels();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The cached global tiers on `record` only refresh when the owner session
  // opens, so they can be stale. This view reads its own authoritative copy
  // on arrival and holds it here; every control stays disabled until that
  // read lands, so a stale value is never shown as editable.
  const [globals, setGlobals] = useState<SharedModelTierSettings | null>(null);
  const overrides: SharedModelTierSettings = record.modelOverrides ?? {};

  useEffect(() => {
    let active = true;
    void actions.refreshModelTiers(record.id).then((outcome) => {
      if (!active) return;
      if (!outcome.ok) {
        setNotice(outcome.text);
        return;
      }
      setGlobals(outcome.tiers ?? {});
    });
    return () => { active = false; };
  }, [actions, record.id]);

  const gated = globals === null || busy !== null;

  const submit = async (tier: ModelTier, run: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(tier);
    setNotice(null);
    try {
      const outcome = await run();
      setNotice(outcome.text);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ar-body">
      <div className="ar-models-head">
        <Button variant="outline" size="sm" className="ar-btn" onClick={onBack}>Back to project</Button>
        <span className="ar-models-title">Project models · {record.name}</span>
        <span className="ar-models-rev">revision {record.modelConfigRevision ?? 0}</span>
      </div>

      {globals === null && notice === null && <p className="ar-why">Reading the current model defaults…</p>}
      {notice !== null && <p className="ar-notice" role="status">{notice}</p>}

      <table className="ar-tiers">
        <thead>
          <tr><th>Tier</th><th>Project selection</th><th>Effective</th><th>Source</th><th /></tr>
        </thead>
        <tbody>
          {MODEL_TIERS.map((tier) => {
            const override = overrides[tier];
            const effective = override ?? (globals ?? {})[tier];
            const inherited = !override;
            const options = groups.flatMap((group) => group.models.map((model) => ({
              value: modelKey(model.provider, model.modelId),
              label: model.name,
              thinking: model.availableThinkingLevels ?? [],
            })));
            const selected = effective ? modelKey(effective.provider, effective.modelId) : '';
            const entry = options.find((option) => option.value === selected);
            return (
              <tr key={tier} data-override={override ? 1 : 0}>
                <td className="ar-tier">{tier}</td>
                <td>
                  <select
                    aria-label={`${tier} project model`}
                    value={selected}
                    disabled={gated}
                    onChange={(event) => {
                      const picked = options.find((option) => option.value === event.target.value);
                      if (!picked) return;
                      const thinking = (effective?.thinkingLevel && picked.thinking.includes(effective.thinkingLevel))
                        ? effective.thinkingLevel
                        : picked.thinking[0];
                      void submit(tier, () => actions.setModelDefault(record.id, tier, picked.value, thinking));
                    }}
                  >
                    <option value="">Not selected</option>
                    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {entry && entry.thinking.length > 0 && (
                    <select
                      aria-label={`${tier} thinking level`}
                      value={effective?.thinkingLevel ?? entry.thinking[0]}
                      disabled={gated}
                      onChange={(event) => {
                        void submit(tier, () => actions.setModelDefault(
                          record.id, tier, selected, event.target.value as ThinkingLevel,
                        ));
                      }}
                    >
                      {entry.thinking.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {effective
                    ? <span className="ar-tier-effective">{selected}<small>{effective.thinkingLevel ?? 'medium'} thinking</small></span>
                    : <span className="ar-tier-effective">Not selected<small>choose a model to run work</small></span>}
                </td>
                <td>
                  <span className="ar-tier-source">{inherited ? 'inherited global' : 'project override'}</span>
                </td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ar-btn"
                    disabled={inherited || gated}
                    onClick={() => void submit(tier, () => actions.clearModelDefault(record.id, tier))}
                  >
                    Use global
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="ar-models-note">
        Saving affects new dispatches, new direct calls and the next idle owner turn.
        It does not change a turn that is already running, and it does not change the
        defaults of a Workflow or Room that was already created.
      </p>
      {record.session.model && (
        <p className="ar-models-note">
          The owner is running {record.session.model}
          {record.session.thinking ? ` with ${record.session.thinking} thinking` : ''}.
          An explicit owner environment pin outranks the MED tier.
        </p>
      )}
    </div>
  );
}
