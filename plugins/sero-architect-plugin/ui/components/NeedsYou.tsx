import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import { Check } from 'lucide-react';

import type { Decision, Milestone, ProjectRecord } from '../../shared/record';
import { usd } from '../lib/format';
import { AUTONOMY_LABEL, needsYouItems, parkedTitles, recommendedOption } from '../lib/view-model';
import type { ActionOutcome } from '../lib/actions';
import { Quiet, SectionHead } from './Pill';

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

export function DecisionCard({ decision, record, actions }: { decision: Decision; record: ProjectRecord; actions: NeedsYouActions }) {
  const recommended = recommendedOption(decision);
  const [selected, setSelected] = useState(recommended?.id ?? '');
  const [note, setNote] = useState('');
  const { busy, error, submit } = useSubmit();
  const parked = parkedTitles(decision, record);
  return (
    <article className="ar-card ar-decision" aria-label="Decision">
      <h3 className="ar-q">{decision.question}</h3>
      <p className="ar-why"><b>Escalated because</b> {decision.reason}</p>
      <ul className="ar-opts" role="radiogroup" aria-label="Options">
        {decision.options.map((option) => (
          <li key={option.id}>
            <label className="ar-opt" data-on={option.id === selected ? 1 : 0}>
              <input type="radio" name={decision.id} value={option.id} checked={option.id === selected} onChange={() => setSelected(option.id)} />
              <span className="ar-radio" />
              <span className="ar-opt-text"><b>{option.label}</b><span>{option.consequence}</span></span>
              {option.id === decision.recommendation ? <span className="ar-rec"><Check className="ar-i" />Recommended</span> : <span />}
            </label>
          </li>
        ))}
      </ul>
      <div className="ar-dfoot">
        <input className="ar-note-in" type="text" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for the Architect (optional)" aria-label="Note" />
        <Button size="sm" className="ar-btn ar-btn-solid" disabled={busy || !selected} onClick={() => void submit(() => actions.answer(decision.id, selected, note))}>
          <Check className="ar-i" />Answer
        </Button>
      </div>
      {parked.length > 0 && (
        <p className="ar-parks">Parks {parked.map((title) => <code key={title}>{title}</code>)} until answered. No timeout, no default.</p>
      )}
      {error && <p className="ar-error">{error}</p>}
    </article>
  );
}

export function CharterCard({ record, actions }: { record: ProjectRecord; actions: NeedsYouActions }) {
  const { busy, error, submit } = useSubmit();
  const charter = record.charter;
  if (!charter) return null;
  return (
    <article className="ar-card" aria-label="Charter approval">
      <h3 className="ar-q">Approve the charter</h3>
      {record.brief && <p className="ar-brief">{record.brief}</p>}
      <div className="ar-terms">
        <div className="ar-term"><span className="ar-k">Cost cap</span><span className="ar-v ar-mono">{usd(charter.capUsd)}</span></div>
        <div className="ar-term"><span className="ar-k">Milestones</span><span className="ar-v">{charter.milestoneIds.length}, in the rail below</span></div>
        <div className="ar-term"><span className="ar-k">Autonomy</span><span className="ar-v">{AUTONOMY_LABEL[charter.autonomy]}</span></div>
        <div className="ar-term"><span className="ar-k">Always escalates</span><span className="ar-v">Charter changes, external delivery, spend over cap</span></div>
      </div>
      {charter.escalationPolicy && <p className="ar-plan">{charter.escalationPolicy}</p>}
      <div className="ar-dfoot">
        <span className="ar-why">To ask for a change instead, send a directive below.</span>
        <Button size="sm" className="ar-btn ar-btn-solid" disabled={busy} onClick={() => void submit(actions.approveCharter)}>
          <Check className="ar-i" />Approve charter
        </Button>
      </div>
      {error && <p className="ar-error">{error}</p>}
    </article>
  );
}

export function MilestoneApprovalCard({ milestone, actions }: { milestone: Milestone; actions: NeedsYouActions }) {
  const { busy, error, submit } = useSubmit();
  return (
    <article className="ar-card" aria-label="Milestone plan approval">
      <h3 className="ar-q">Approve the plan for {milestone.title}</h3>
      {milestone.plan && <p className="ar-plan">{milestone.plan}</p>}
      <div className="ar-dfoot">
        <span className="ar-why">Approval lets the Architect dispatch this milestone.</span>
        <Button size="sm" className="ar-btn ar-btn-solid" disabled={busy} onClick={() => void submit(() => actions.approveMilestone(milestone.id))}>
          <Check className="ar-i" />Approve plan
        </Button>
      </div>
      {error && <p className="ar-error">{error}</p>}
    </article>
  );
}

export function NeedsYou({ record, actions }: { record: ProjectRecord; actions: NeedsYouActions }) {
  const items = needsYouItems(record);
  return (
    <section aria-labelledby="ar-needs-h">
      <SectionHead id="ar-needs-h" title="Needs you" count={items.length ? String(items.length) : 'none'} warn={items.length > 0} />
      {items.length === 0 ? (
        <Quiet tone="ok">Nothing is needed from you.{record.paused ? ' The project is paused.' : ''}</Quiet>
      ) : (
        <div className="ar-col">
          {items.map((item) => {
            if (item.kind === 'decision') return <DecisionCard key={item.decision.id} decision={item.decision} record={record} actions={actions} />;
            if (item.kind === 'charter') return <CharterCard key="charter" record={record} actions={actions} />;
            return <MilestoneApprovalCard key={item.milestone.id} milestone={item.milestone} actions={actions} />;
          })}
        </div>
      )}
    </section>
  );
}
