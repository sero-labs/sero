import { useState } from 'react';
import { getSeroApi, openSeroApp, usePendingQuestions } from '@sero-ai/app-runtime';
import type { UserFeedbackPendingQuestion } from '@sero-ai/common';
import type { ProjectRecord } from '../../shared/record';

function HostRequest({ request }: { request: UserFeedbackPendingQuestion }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const question = request.questions[0];
  if (!question) return null;
  const answer = async (value: string, label: string, wasCustom = false) => {
    setBusy(true);
    try {
      await getSeroApi().userFeedback?.answer({ id: request.id, cancelled: false, answers: [{ questionId: question.id, value, label, wasCustom }] });
    } catch (cause) {
      setError(String(cause));
      setBusy(false);
    }
  };
  const multi = request.questions.length > 1 || request.type === 'questionnaire' || request.type === 'interview';
  return (
    <article aria-label={request.type === 'permission' ? 'Permission request' : 'Host question'}>
      <h3>{question.label}</h3>
      <p className="bd-why">{question.prompt}</p>
      {question.detail && <details><summary>Details</summary><p className="bd-why">{question.detail}</p></details>}
      {multi ? <button type="button" className="bd-link" onClick={() => void openSeroApp('userfeedback')}>Answer the questions</button> : <>
        <div className="bd-btns">{question.options.map((option) => <button key={option.value} type="button" className="bd-opt" disabled={busy} onClick={() => void answer(option.value, option.label)}>{option.label}{option.description && <small>{option.description}</small>}</button>)}</div>
        {question.allowOther && <form onSubmit={(event) => { event.preventDefault(); if (custom.trim()) void answer(custom.trim(), custom.trim(), true); }}><input aria-label="Your answer" className="bd-ask-note" value={custom} onChange={(event) => setCustom(event.target.value)} /><button type="submit" disabled={busy || !custom.trim()}>Send answer</button></form>}
      </>}
      {request.fallbackLabel && <p className="bd-parks">Without an answer: {request.fallbackLabel}.</p>}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}

/** One project owns a workspace. Host provenance binds requests to that workspace or exact owner. */
export function BoardRequests({ record }: { record: ProjectRecord }) {
  const pending = usePendingQuestions().filter((request) => request.openTarget?.appId === 'architect'
    ? request.openTarget.params?.projectId === record.id
    : Boolean(record.workspaceId && request.context?.workspaceId === record.workspaceId));
  if (pending.length === 0) return null;
  return <section className="bd-tile bd-main" aria-label="Pending requests"><h2 className="bd-label" data-tone="waiting">Needs you</h2>{pending.map((request) => <HostRequest key={request.id} request={request} />)}</section>;
}
