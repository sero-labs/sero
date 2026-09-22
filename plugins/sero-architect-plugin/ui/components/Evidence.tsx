/**
 * A milestone's evidence as a list of checks (prototype frame 2).
 *
 * Each check is its own row and owns its own output. The record used to print
 * every command's log at once, each cut to its last 400 characters, so the one
 * check that failed was buried in three that passed. Now a row opens on its
 * own — two checks can be read side by side — and the output is complete.
 *
 * A check with no duration shows none. A list of changed files and a capture
 * have no duration in the record, and one is never invented to fill the column.
 */

import { ChevronRight } from 'lucide-react';
import { Button } from '@sero-ai/ui';

import type { EvidenceRecord } from '../../shared/record';
import { evidenceLines, type EvidenceCheck } from '../lib/view-model';
import { useProjectPreview } from '../lib/use-project-preview';
import { PreviewFrame } from './PreviewFrame';

/** A duration as the drawing prints it: one decimal, in seconds. */
function seconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
}

const MARK: Record<EvidenceCheck['state'], string> = { ok: '✓', err: '✕', dim: '·' };

function CheckRow({ check, projectId }: { check: EvidenceCheck; projectId: string }) {
  const preview = useProjectPreview(projectId);

  if (check.opensPreview) {
    return (
      <>
        <div className="ar-check-cap">
          <span data-state={check.state}>{MARK[check.state]}</span>
          <span className="ar-check-name">{check.name}</span>
          <Button size="sm" disabled={preview.busy} onClick={() => void preview.open()}>
            {preview.busy ? 'Starting preview…' : 'Open preview'}
          </Button>
        </div>
        {preview.error && <p role="alert" className="ar-error">{preview.error}</p>}
        {preview.url && <PreviewFrame url={preview.url} />}
      </>
    );
  }

  return (
    <details>
      <summary>
        <span data-state={check.state}>{MARK[check.state]}</span>
        <span className="ar-check-name">{check.name}</span>
        {check.detail && <span data-state="err">{check.detail}</span>}
        {check.durationMs !== undefined && <span className="ar-check-t">{seconds(check.durationMs)}</span>}
      </summary>
      {check.output && <pre>{check.output}</pre>}
    </details>
  );
}

export function Evidence({ evidence, projectId }: { evidence: EvidenceRecord; projectId: string }) {
  const checks = evidenceLines(evidence);
  return (
    <details className="ar-evidence">
      <summary>
        <ChevronRight className="ar-i" />
        Evidence at {evidence.commit.slice(0, 7)}{evidence.stale ? ' · stale' : ''}
      </summary>
      <ul className="ar-checks">
        {checks.map((check) => (
          // `check.key` names the row by its own name plus how many identical
          // ones came before, because two checks can share a name — a command
          // can be listed more than once.
          <li key={check.key}>
            <CheckRow check={check} projectId={projectId} />
          </li>
        ))}
      </ul>
    </details>
  );
}
