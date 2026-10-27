import { useState, type ReactNode } from 'react';
import { Button } from '@sero-ai/ui';
import { openSeroApp } from '@sero-ai/app-runtime';
import { isSetAside } from '../../shared/activity';
import type { Milestone, ProjectRecord } from '../../shared/record';
import { elapsedLabel } from '../lib/board';
import { money } from '../lib/format';
import { evidenceProblem, receiptUrl, resultGaps, resultMilestones, resultNeedsReview } from '../lib/result';
import { Evidence } from './Evidence';

function RecordedStep({ record, milestone, allowPreview }: { record: ProjectRecord; milestone: Milestone; allowPreview: boolean }) {
  const problem = evidenceProblem(record, milestone);
  const level = milestone.verification;
  const url = milestone.receipt ? receiptUrl(milestone.receipt) : null;
  return (
    <li>
      <b>{milestone.title}</b>
      <p className="bd-note">
        {isSetAside(milestone) ? 'Set aside' : level === 'delivered' ? 'Delivery recorded' : level === 'accepted' ? 'Acceptance recorded' : level === 'verified' ? 'Checked' : level === 'reported' ? 'Reported by the agent' : 'Not reported'}
        {problem ? ` · ${problem}` : ' · Recorded checks passed'}
      </p>
      {milestone.direct?.claim && <p className="bd-note">Reported: {milestone.direct.claim.summary}</p>}
      {milestone.receipt && <p className="bd-note">Saved destination: {url ? <a className="bd-link" href={url} target="_blank" rel="noopener noreferrer">{milestone.receipt}</a> : milestone.receipt}</p>}
      {milestone.direct?.placement.branch && <p className="bd-note">Branch: {milestone.direct.placement.branch}</p>}
      {milestone.evidence && <>
        <p className="bd-note">Checked {milestone.evidence.checkedAt} · {milestone.evidence.binding?.workingRevision == null ? 'Requirement revision not recorded' : `Requirement revision ${milestone.evidence.binding.workingRevision}`}</p>
        <Evidence evidence={milestone.evidence} projectId={record.id} allowPreview={allowPreview} />
      </>}
    </li>
  );
}

export function BoardResult({ record, preview, onOpenChecks, onContinue, picture }: {
  record: ProjectRecord;
  preview: { busy: boolean; open(): void } | null;
  onOpenChecks: (() => void) | null;
  onContinue(): void;
  picture?: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const milestones = resultMilestones(record);
  const gaps = resultGaps(record);
  const needsReview = resultNeedsReview(record);
  const result = record.overview?.result?.text;
  const destination = [...milestones].reverse().find((milestone) => milestone.receipt);
  const url = destination?.receipt ? receiptUrl(destination.receipt) : null;
  // A worktree has its own registered workspace. Never open the project folder
  // as though it contained that branch's output.
  const placement = destination?.direct?.placement;
  const workspaceId = placement?.mode === 'worktree'
    ? placement.workspaceId : record.workspaceId;
  const workspaceResult = !destination || destination.receipt === record.folder
    || destination.receipt === placement?.directory || destination.receipt === placement?.branch;
  const openWorkspace = async (appId: string) => {
    if (!workspaceId) return;
    const opened = await openSeroApp(appId, undefined, workspaceId);
    setError(opened ? null : 'This result workspace is unavailable.');
  };
  return (
    <section className="bd-tile bd-main bd-result" aria-label="Result">
      <h2 className="bd-label">Result</h2>
      <div className="bd-result-text">
        <h3>{needsReview ? 'Review the recorded result' : destination ? 'Delivery recorded' : 'Work accepted'}</h3>
        <details><summary className="bd-link">Requested outcome</summary><p className="bd-why">{record.idea}</p></details>
        {record.working?.objective && record.working.objective !== record.idea && <p className="bd-note">Current objective: {record.working.objective}</p>}
        <p className="bd-why">{result ? `Architect's account: ${result}` : 'No result account recorded. Open the work and checks below.'}</p>
        <p className="bd-note">Project total: {money(record.budget.spentUsd)} · {elapsedLabel(record.createdAt, Date.parse(record.updatedAt))} elapsed through the last update.</p>
        {record.budget.incomplete !== false && <p className="bd-note">Incomplete accounting: some usage is unavailable; cost is a lower bound.</p>}
        <div className="bd-btns">
          {url ? <a className="bd-link" href={url} target="_blank" rel="noopener noreferrer">Open result</a> : workspaceId && workspaceResult && <Button size="sm" className="ar-btn ar-btn-solid" onClick={() => void openWorkspace('explorer')}>Open result</Button>}
          {workspaceId && <Button size="sm" variant="outline" onClick={() => void openWorkspace('git')}>Open Git changes</Button>}
          {preview && <Button size="sm" disabled={preview.busy} onClick={preview.open}>{preview.busy ? 'Starting preview…' : 'Open preview'}</Button>}
          {onOpenChecks && <Button size="sm" variant="outline" onClick={onOpenChecks}>See the checks</Button>}
          <Button size="sm" variant="outline" onClick={onContinue}>Request changes / continue</Button>
        </div>
        {error && <p role="alert" className="ar-error">{error}</p>}
        <ul className="bd-result-steps">{milestones.map((milestone) => <RecordedStep key={milestone.id} record={record} milestone={milestone} allowPreview={preview !== null} />)}</ul>
        {gaps.length > 0 && <div><h4>Needs review</h4><ul>{gaps.map((gap) => <li key={gap.id}>{gap.text}: {gap.reason}</li>)}</ul></div>}
        {!record.working?.criteria.length && <p className="bd-note">Requirement coverage is not recorded. Review the result against your request.</p>}
        <p className="bd-note">Checks and destinations describe saved records. Open the result to review its current state.</p>
      </div>
      {picture}
    </section>
  );
}
