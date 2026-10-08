import { useState, type ReactNode } from 'react';
import { Button } from '@sero-ai/ui';
import { Check, Compass, ExternalLink } from 'lucide-react';

import { hasAgreement } from '../../shared/agreement';
import type { Decision, ProjectRecord } from '../../shared/record';
import { elapsedLabel, type Board, type BoardStep, type MadeRow } from '../lib/board';
import { money, spendRatio, spendTone } from '../lib/format';
import type { WorkTab } from '../lib/navigation';
import { needsYouItems, parkedTitles } from '../lib/view-model';
import { CharterCard, MilestoneApprovalCard, type NeedsYouActions } from './NeedsYou';

/** Where things are, in the Architect's words, with the state and the two meters. */
export function BoardHero({ record, board }: { record: ProjectRecord; board: Board }) {
  const cap = record.budget.capUsd ?? record.agreement?.capUsd ?? null;
  const spent = record.budget.spentUsd;
  const incomplete = record.budget.incomplete !== false;
  return (
    <section className="bd-tile bd-hero" aria-label="Project state">
      <span className="bd-face"><Compass /></span>
      <div>
        <p className="bd-says">{board.sentence}</p>
        {!hasAgreement(record) && <p className="bd-note">This project uses the charter flow. The charter flow is deprecated.</p>}
        <p className="bd-doing" data-tone={board.tone}><span className="bd-dot" /><span><b>{board.word}</b> {board.detail}</span></p>
      </div>
      <div className="bd-nums">
        {board.progress && (
          <div className="bd-meter">
            <span><b>{board.progress.done} of {board.progress.total}</b> {board.progress.total === 1 ? 'step' : 'steps'} done</span>
            <span className="bd-bar" data-seg="">
              {Array.from({ length: board.progress.total }, (_, index) => <i key={index} data-on={index < board.progress!.done ? '' : undefined} />)}
            </span>
          </div>
        )}
        <div className="bd-meter" title={incomplete ? 'Some usage is unavailable. The shown cost is a lower bound.' : undefined}>
          <span><b>{money(spent)}</b>{cap === null ? ' spent, no cap yet' : ` of ${money(cap)}`}</span>
          <span>{elapsedLabel(record.createdAt, Date.parse(record.updatedAt))}</span>
          {cap !== null && <span className="bd-bar" data-tone={spendTone(spent, cap)}><s style={{ width: `${Math.round(spendRatio(spent, cap) * 100)}%` }} /></span>}
        </div>
      </div>
    </section>
  );
}

/** One question. A choice is an answer: pressing it sends it. */
function Question({ decision, record, actions }: { decision: Decision; record: ProjectRecord; actions: NeedsYouActions }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parked = parkedTitles(decision, record);
  const answer = async (optionId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await actions.answer(decision.id, optionId, note);
      if (!outcome.ok) setError(outcome.text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article aria-label="Decision">
      <h3>{decision.question}</h3>
      <p className="bd-why">{decision.reason}</p>
      <div className="bd-opts" role="group" aria-label="Choices">
        {decision.options.map((option) => (
          <button key={option.id} type="button" className="bd-opt" disabled={busy} onClick={() => void answer(option.id)}>
            <span className="bd-rec">{option.id === decision.recommendation ? 'Architect suggests this' : ''}</span>
            <b>{option.label}</b>
            <small>{option.consequence}</small>
          </button>
        ))}
      </div>
      <div className="bd-ask-foot">
        <input className="bd-ask-note" type="text" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note to your answer (optional)" aria-label="Note" />
      </div>
      {parked.length > 0 && <p className="bd-parks">Waiting for your answer: {parked.join(', ')}. There is no default answer.</p>}
      {error && <p className="bd-error" role="alert">{error}</p>}
    </article>
  );
}

/** Every open question and saved approval, in the order the runtime counts them. */
export function BoardAsk({ record, actions, onOpenWork }: { record: ProjectRecord; actions: NeedsYouActions; onOpenWork(tab: WorkTab): void }) {
  return (
    <section className="bd-tile bd-main" aria-label="Needs you">
      <h2 className="bd-label" data-tone="waiting">Needs you</h2>
      {needsYouItems(record).map((item) => {
        if (item.kind === 'decision') return <Question key={item.decision.id} decision={item.decision} record={record} actions={actions} />;
        if (item.kind === 'charter') return <CharterCard key="charter" record={record} actions={actions} onOpenWork={onOpenWork} />;
        return <MilestoneApprovalCard key={item.milestone.id} milestone={item.milestone} actions={actions} onOpenWork={onOpenWork} />;
      })}
    </section>
  );
}

/** What stopped, why, and the control that fixes it. */
export function BoardStopped({ label, headline, what, reason, detail, children }: { label: string; headline: string; what: string | null; reason: string | null; detail?: string; children: ReactNode }) {
  return (
    <section className="bd-tile bd-main" aria-label={label}>
      <h2 className="bd-label" data-tone="stopped">{label}</h2>
      <h3>{headline}</h3>
      {what && <p className="bd-why">{what}</p>}
      {reason && <p className="bd-why">{reason}</p>}
      {detail && <details><summary className="bd-link">Technical details</summary><p className="bd-parks">{detail}</p></details>}
      <div className="bd-btns">{children}</div>
    </section>
  );
}

export function BoardResult({ headline, text, preview, onOpenChecks }: { headline: string; text: string | null; preview: { busy: boolean; open(): void } | null; onOpenChecks: (() => void) | null }) {
  return (
    <section className="bd-tile bd-main" aria-label="Result">
      <h2 className="bd-label">Result</h2>
      <div className="bd-result-text">
        <h3>{headline}</h3>
        {text && <p className="bd-why">{text}</p>}
        <div className="bd-btns">
          {preview && <Button size="sm" className="ar-btn ar-btn-solid" disabled={preview.busy} onClick={preview.open}><ExternalLink className="ar-i" />{preview.busy ? 'Starting preview…' : 'Open preview'}</Button>}
          {onOpenChecks && <Button size="sm" variant="outline" className="ar-btn" onClick={onOpenChecks}>See the checks</Button>}
        </div>
      </div>
    </section>
  );
}

function Step({ step, onOpenChecks }: { step: BoardStep; onOpenChecks(milestoneId: string): void }) {
  return (
    <div className="bd-step" data-state={step.state}>
      <span className="bd-mark">{step.state === 'done' && <Check />}</span>
      <div>
        <b>{step.title}</b>
        {step.note && <small>{step.note}</small>}
        {step.checked && <div className="bd-thumb"><button type="button" className="bd-link" onClick={() => onOpenChecks(step.id)}>See the proof</button></div>}
      </div>
    </div>
  );
}

export function BoardPlan({ steps, onOpenPlan, onOpenChecks }: { steps: readonly BoardStep[]; onOpenPlan(): void; onOpenChecks(milestoneId: string): void }) {
  return (
    <section className="bd-tile" aria-label="Plan">
      <h2 className="bd-label"><span>Plan</span><button type="button" className="bd-link bd-end" onClick={onOpenPlan}>Full plan</button></h2>
      {steps.map((step) => <Step key={step.id} step={step} onOpenChecks={onOpenChecks} />)}
    </section>
  );
}

/** The choices that shape the work. Change opens a message; it sends nothing. */
export function BoardMade({ rows, onChange }: { rows: readonly MadeRow[]; onChange(row: MadeRow): void }) {
  return (
    <section className="bd-tile" aria-label="Decisions made">
      <h2 className="bd-label">Decisions made</h2>
      <ul className="bd-made">
        {rows.map((row) => (
          <li key={row.key}>
            <b>{row.text}</b>
            <span className="bd-who" data-you={row.by === 'you' ? '' : undefined}>{row.by === 'you' ? 'You' : 'Architect'} · <button type="button" className="bd-link" onClick={() => onChange(row)}>Change</button></span>
            {row.why && <small>{row.why}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}
