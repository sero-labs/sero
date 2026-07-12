/**
 * GitStatusWidget — the working tree at a glance for the dashboard.
 *
 * Current branch and its sync state against the remote, staged/unstaged
 * counts, and the files that changed. Presentation is composed from the
 * shared @sero-ai/ui dashboard components.
 */

import { useAppState } from '@sero-ai/app-runtime';
import {
  ActivityList,
  ActivityListItem,
  Alert,
  AlertTitle,
  DataBoundary,
  EmptyState,
  Icon,
  Inline,
  Metric,
  MetricCard,
  Section,
  Stack,
  Status,
  Text,
  WidgetContent,
  type Tone,
} from '@sero-ai/ui';
import { CheckCircle2, FileDiff, GitBranch, Layers } from 'lucide-react';
import type { FileChange, FileChangeStatus, GitAppState } from '../../shared/types';
import { DEFAULT_GIT_STATE, normalizeGitState } from '../../shared/types';
import '../styles.css';

/** How many files each section peeks before "+N more". */
const SHOWN = 3;

/** Tone for a change row's status dot — conventional git colours. */
function changeTone(status: FileChangeStatus): Tone {
  switch (status) {
    case 'added':
      return 'success';
    case 'deleted':
      return 'error';
    case 'untracked':
      return 'neutral';
    default:
      return 'info'; // modified / renamed / copied
  }
}

function ChangeRows({ changes }: { changes: FileChange[] }) {
  return (
    <ActivityList overflowCount={Math.max(0, changes.length - SHOWN)}>
      {changes.slice(0, SHOWN).map((f) => (
        <ActivityListItem
          key={`${f.path}:${f.staged}`}
          tone={changeTone(f.status)}
          label={<span title={f.path}>{f.path}</span>}
          timestamp={f.status}
        />
      ))}
    </ActivityList>
  );
}

export function GitStatusWidget() {
  const [rawState] = useAppState<GitAppState>(DEFAULT_GIT_STATE);
  const state = normalizeGitState(rawState);

  const current = state.branches.find((b) => b.current);
  const ahead = current?.ahead ?? 0;
  const behind = current?.behind ?? 0;
  const staged = state.fileChanges.filter((f) => f.staged);
  const unstaged = state.fileChanges.filter((f) => !f.staged);

  return (
    <WidgetContent>
      <DataBoundary
        state={state.error ? 'error' : !state.repoPath ? 'empty' : 'ready'}
        empty={<EmptyState icon={GitBranch} title="No repository" />}
        error={
          <Alert variant="destructive">
            <AlertTitle>{state.error}</AlertTitle>
          </Alert>
        }
      >
        <Stack gap="sm" fill>
          <Inline justify="between" align="center">
            <Inline gap="xs" align="center" className="min-w-0">
              <Icon icon={GitBranch} size="sm" />
              <Text variant="label" truncate title={state.currentBranch}>
                {state.currentBranch || state.repoName}
              </Text>
            </Inline>
            {ahead > 0 || behind > 0 ? (
              <Status
                tone="info"
                variant="pill"
                title={`${ahead} ahead · ${behind} behind ${current?.remote ?? 'remote'}`}
              >
                {ahead > 0 ? `↑${ahead}` : ''}
                {ahead > 0 && behind > 0 ? ' ' : ''}
                {behind > 0 ? `↓${behind}` : ''}
              </Status>
            ) : current?.remote ? (
              <Status tone="success" variant="pill">Synced</Status>
            ) : null}
          </Inline>

          <Inline gap="sm" wrap>
            <MetricCard className="flex-1">
              <Metric label="Staged" value={staged.length} icon={Layers} />
            </MetricCard>
            <MetricCard className="flex-1">
              <Metric label="Unstaged" value={unstaged.length} icon={FileDiff} />
            </MetricCard>
          </Inline>

          <DataBoundary
            state={state.fileChanges.length === 0 ? 'empty' : 'ready'}
            empty={<EmptyState icon={CheckCircle2} title="Working tree clean" />}
          >
            <Stack gap="sm" scroll>
              {staged.length > 0 && (
                <Section heading="Staged" gap="xs">
                  <ChangeRows changes={staged} />
                </Section>
              )}
              {unstaged.length > 0 && (
                <Section heading="Changes" gap="xs">
                  <ChangeRows changes={unstaged} />
                </Section>
              )}
            </Stack>
          </DataBoundary>
        </Stack>
      </DataBoundary>
    </WidgetContent>
  );
}

export default GitStatusWidget;
