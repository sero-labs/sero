import { useAvailableModels } from '@sero-ai/app-runtime';
import { MODEL_TIERS, modelKey, type ModelTier, type SharedModelTierSettings, type ThinkingLevel } from '@sero-ai/common';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui';
import { AvailableModelPicker } from '@sero-ai/ui/model-selection/available-model-picker';
import { useEffect, useState } from 'react';

import type { SelectionSource } from '../../shared/model-config';
import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';
import { ActivityGlyphIcon } from './ActivityWord';

/** What each source is called in the table's Source column. */
const SOURCE_WORD: Record<SelectionSource, string> = {
  'project-override': 'project',
  'inherited-global': 'global',
  'owner-environment-pin': 'environment',
  'manual-pin': 'manual pin',
};

/** The picker's "no project choice" entry. The styled Select refuses an empty value. */
const NONE = '__none__';

interface ModelOption {
  value: string;
  label: string;
  thinking: readonly ThinkingLevel[];
}

/**
 * The owner as a row of the same table.
 *
 * It used to be one or two sentences under the table: "The owner is running
 * gpt-5.6-luna with high thinking" followed by "An explicit owner environment
 * pin outranks the MED tier", which the page printed whether or not a pin
 * existed. The reader then had to work out how that related to the three tiers
 * above it. The row states its selection, what it outranks, what runs and
 * where it came from, in the four columns the tiers use.
 */
function OwnerRow({ record, runtimeRunning }: { record: ProjectRecord; runtimeRunning: boolean }) {
  const { model, modelSource, modelOutranks } = record.session;
  if (!model) return null;
  // With the Architect off, what is on the record is the last reading, not a
  // live one, whichever rule produced it. Saying how it was chosen would claim
  // the rule still holds; the page cannot know that until the runtime starts.
  if (!runtimeRunning) {
    return (
      <tr className="ar-tier-owner">
        <td className="ar-tier">OWNER</td>
        <td><span className="ar-tier-source">Last known</span></td>
        <td><span className="ar-tier-effective">{model}</span></td>
        <td><span className="ar-tier-source">{modelSource ? SOURCE_WORD[modelSource] : 'not recorded'}</span></td>
        <td />
      </tr>
    );
  }
  const pinned = modelSource === 'owner-environment-pin';
  const selection = pinned
    ? `Pinned by the owner environment.${modelOutranks ? ` It outranks the ${modelOutranks} tier.` : ''}`
    : `Follows the ${modelOutranks ?? 'MED'} tier.`;
  return (
    <tr className="ar-tier-owner">
      <td className="ar-tier">OWNER</td>
      <td><span className="ar-tier-source">{selection}</span></td>
      <td>
        <span className="ar-tier-effective">{model}</span>
      </td>
      <td>
        <span className="ar-tier-source">{modelSource ? SOURCE_WORD[modelSource] : 'not recorded'}</span>
      </td>
      <td />
    </tr>
  );
}

/**
 * Project model defaults (spec architect-model-overrides).
 *
 * One row per tier, and the owner as a fourth. A tier without an override
 * inherits the global selection, and clearing it restores that inheritance.
 *
 * A tier that inherits says so even when the global cannot be read. It used to
 * read "Not selected · choose a model to run work" with the Architect off,
 * which asked the user to fix something that was neither missing nor theirs:
 * the selection exists on the host, and the page simply could not reach it.
 */
export function ModelSettings({ record, actions, runtimeRunning, onBack }: {
  record: ProjectRecord;
  actions: ArchitectActions;
  /** Whether the Architect runtime is running in this session. */
  runtimeRunning: boolean;
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
  // Reading the globals failed, so an inherited tier's model is unknown here.
  // That is not the same as the project having chosen nothing.
  const globalsUnreadable = globals === null && notice !== null;

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

  const options: ModelOption[] = groups.flatMap((group) => group.models.map((model) => ({
    value: modelKey(model.provider, model.modelId),
    label: model.name,
    thinking: model.availableThinkingLevels ?? [],
  })));

  return (
    <div className="ar-body">
      <div className="ar-models-head">
        <Button variant="outline" size="sm" className="ar-btn" onClick={onBack}>Back to project</Button>
        <span className="ar-models-title">Project models · {record.name}</span>
        <span className="ar-models-rev">revision {record.modelConfigRevision ?? 0}</span>
      </div>

      {globals === null && notice === null && <p className="ar-why">Reading the current model defaults…</p>}
      {/* The refusal itself stays: it says what went wrong. Each tier below
          then says what that means for it. */}
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
            const selected = effective ? modelKey(effective.provider, effective.modelId) : '';
            const entry = options.find((option) => option.value === selected);
            return (
              <tr key={tier} data-override={override ? 1 : 0}>
                <td className="ar-tier">{tier}</td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <AvailableModelPicker
                      groups={groups}
                      value={selected || NONE}
                      leadingOptions={[
                        { value: NONE, label: inherited && globalsUnreadable ? 'Global' : 'Not selected' },
                      ]}
                      ariaLabel={`${tier} project model`}
                      disabled={gated}
                      onChange={(value) => {
                        // The first choice restores inheritance. It is not a
                        // model, so it clears rather than setting a default.
                        if (value === NONE || value === '') {
                          void submit(tier, () => actions.clearModelDefault(record.id, tier));
                          return;
                        }
                        const picked = options.find((option) => option.value === value);
                        if (!picked) return;
                        const thinking = (effective?.thinkingLevel && picked.thinking.includes(effective.thinkingLevel))
                          ? effective.thinkingLevel
                          : picked.thinking[0];
                        void submit(tier, () => actions.setModelDefault(record.id, tier, picked.value, thinking));
                      }}
                      className="min-w-0 flex-1"
                    />
                    {entry && entry.thinking.length > 0 && (
                      <Select
                        value={effective?.thinkingLevel ?? entry.thinking[0]}
                        disabled={gated}
                        onValueChange={(value) => {
                          void submit(tier, () => actions.setModelDefault(
                            record.id, tier, selected, value as ThinkingLevel,
                          ));
                        }}
                      >
                        <SelectTrigger size="sm" aria-label={`${tier} thinking level`} className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {entry.thinking.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </td>
                <td>
                  {effective ? (
                    <span className="ar-tier-effective">
                      {effective.modelId}{effective.thinkingLevel ? ` · ${effective.thinkingLevel}` : ''}
                    </span>
                  ) : globalsUnreadable ? (
                    // The global selection is not missing; it is out of reach
                    // until the runtime starts, and starting it resolves this
                    // without the user choosing anything. The glyph is the one
                    // the rest of the app uses for a last-known reading.
                    <span className="ar-tier-unread">
                      <ActivityGlyphIcon state="last-known" />
                      Global, cannot be read while Architect is off
                    </span>
                  ) : (
                    <span className="ar-tier-effective">Not selected<small>choose a model to run work</small></span>
                  )}
                </td>
                <td>
                  <span className="ar-tier-source">{inherited ? 'global' : 'project'}</span>
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
          <OwnerRow record={record} runtimeRunning={runtimeRunning} />
        </tbody>
      </table>

      {/* One disclosure, once. The same rules used to sit beside the table as a
          paragraph every visit had to read past. */}
      <details className="ar-models-when">
        <summary>When a change takes effect</summary>
        <p className="ar-models-note">
          Saving affects new dispatches, new direct calls and the next idle owner turn.
          It does not change a turn that is already running, and it does not change the
          defaults of a Workflow or Room that was already created.
        </p>
      </details>
    </div>
  );
}
