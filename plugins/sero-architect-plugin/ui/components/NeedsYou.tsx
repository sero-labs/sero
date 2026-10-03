import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import { Check, ChevronRight } from 'lucide-react';

import type { Decision, Milestone, ProjectRecord } from '../../shared/record';
import { usd } from '../lib/format';
import { AUTONOMY_LABEL, needsYouItems, parkedTitles, recommendedOption } from '../lib/view-model';
import type { ActionOutcome } from '../lib/actions';
import type { WorkTab } from '../lib/navigation';

type OpenWork = (tab: WorkTab) => void;

export interface NeedsYouActions {
  answer(decisionId: string, optionId: string, note: string): Promise<ActionOutcome>;
  approveCharter(): Promise<ActionOutcome>;
  approveMilestone(milestoneId: string): Promise<ActionOutcome>;
}

/** One busy flag and one error line per card, so a slow answer cannot be sent twice. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (call: () => Promise<ActionOutcome>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await call();
      if (!outcome.ok) setError(outcome.text);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

export function DecisionCard({ decision, record, actions, onOpenWork }: { decision: Decision; record: ProjectRecord; actions: NeedsYouActions; onOpenWork?: OpenWork }) {
  const recommended = recommendedOption(decision);
  const [selected, setSelected] = useState(recommended?.id ?? '');
  const [note, setNote] = useState('');
  const { busy, error, submit } = useSubmit();
  const parked = parkedTitles(decision, record);
  return (
    <article className="ar-card ar-decision" aria-label="Decision">
      <h3 className="ar-q">{decision.question}</h3>
      <p className="ar-why">{decision.reason}</p>
      <div className="ar-opts" role="radiogroup" aria-label="Options">
        {decision.options.map((option) => (
            <label key={option.id} className="ar-opt" data-on={option.id === selected ? 1 : 0}>
              <input type="radio" name={decision.id} value={option.id} checked={option.id === selected} onChange={() => setSelected(option.id)} />
              <span className="ar-radio" />
              <span className="ar-opt-text"><b>{option.label}</b><span>{option.consequence}</span></span>
              {option.id === decision.recommendation ? <span className="ar-rec"><Check className="ar-i" />Recommended</span> : <span />}
            </label>
        ))}
      </div>
      <div className="ar-dfoot">
        <input className="ar-note-in" type="text" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for the Architect (optional)" aria-label="Note" />
        {onOpenWork && record.milestones.some((milestone) => milestone.evidence)
          ? <button type="button" className="ar-btn-link" onClick={() => onOpenWork('evidence')}>Evidence<ChevronRight className="ar-i" /></button>
          : <span />}
        <Button size="sm" className="ar-btn ar-btn-solid" disabled={busy || !selected} onClick={() => void submit(() => actions.answer(decision.id, selected, note))}>
          <Check className="ar-i" />Answer
        </Button>
      </div>
      {parked.length > 0 && (
        <p className="ar-parks">Waiting for your answer: {parked.join(', ')}. There is no default answer.</p>
      )}
      {error && <p className="ar-error">{error}</p>}
    </article>
  );
}

/** The saved charter gate of a project on the deprecated charter flow. The full charter is in Work, under Plan. */
export function CharterCard({ record, actions, onOpenWork }: { record: ProjectRecord; actions: NeedsYouActions; onOpenWork?: OpenWork }) {
  const { busy, error, submit } = useSubmit();
  const charter = record.charter;
  if (!charter) return null;
  const count = charter.milestoneIds.length;
  return (
    <article className="ar-card" aria-label="Charter approval">
      <h3 className="ar-q">Approve the charter</h3>
      <p className="ar-why">Cost cap {usd(charter.capUsd)} · {count} {count === 1 ? 'milestone' : 'milestones'} · {AUTONOMY_LABEL[charter.autonomy]}</p>
      <div className="ar-dfoot">
        <span />
        {onOpenWork ? <button type="button" className="ar-btn-link" onClick={() => onOpenWork('plan')}>Read the charter<ChevronRight className="ar-i" /></button> : <span />}
        <Button size="sm" className="ar-btn ar-btn-solid" disabled={busy} onClick={() => void submit(actions.approveCharter)}>
          <Check className="ar-i" />Approve charter
        </Button>
      </div>
      {error && <p className="ar-error">{error}</p>}
    </article>
  );
}

/** A saved plan gate. The plan itself is in Work, under Plan, so this card stays short. */
export function MilestoneApprovalCard({ milestone, actions, onOpenWork }: { milestone: Milestone; actions: NeedsYouActions; onOpenWork?: OpenWork }) {
  const { busy, error, submit } = useSubmit();
  return (
    <article className="ar-card" aria-label="Milestone plan approval">
      <h3 className="ar-q">Approve the plan for {milestone.title}</h3>
      <div className="ar-dfoot">
        <span />
        {onOpenWork ? <button type="button" className="ar-btn-link" onClick={() => onOpenWork('plan')}>Read the plan<ChevronRight className="ar-i" /></button> : <span />}
        <Button size="sm" className="ar-btn ar-btn-solid" disabled={busy} onClick={() => void submit(() => actions.approveMilestone(milestone.id))}>
          <Check className="ar-i" />Approve plan
        </Button>
      </div>
      {error && <p className="ar-error">{error}</p>}
    </article>
  );
}

/** Open decisions and saved approvals. Absent while there are none. */
export function NeedsYou({ record, actions, onOpenWork }: { record: ProjectRecord; actions: NeedsYouActions; onOpenWork?: OpenWork }) {
  const items = needsYouItems(record);
  return (
    <>
      {items.map((item) => {
        if (item.kind === 'decision') return <DecisionCard key={item.decision.id} decision={item.decision} record={record} actions={actions} onOpenWork={onOpenWork} />;
        if (item.kind === 'charter') return <CharterCard key="charter" record={record} actions={actions} onOpenWork={onOpenWork} />;
        return <MilestoneApprovalCard key={item.milestone.id} milestone={item.milestone} actions={actions} onOpenWork={onOpenWork} />;
      })}
    </>
  );
}
