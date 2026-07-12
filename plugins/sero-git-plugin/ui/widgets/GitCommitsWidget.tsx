/**
 * GitCommitsWidget — recent commit feed for the dashboard.
 *
 * The latest commits on the current branch: subject, author, short hash and
 * relative age. The HEAD commit gets an accent so "where am I" reads at a
 * glance. Composed from the shared @sero-ai/ui dashboard components.
 */

import { useAppState } from '@sero-ai/app-runtime';
import {
  ActivityList,
  ActivityListItem,
  DataBoundary,
  EmptyState,
  Icon,
  Inline,
  Stack,
  Status,
  Text,
  WidgetContent,
} from '@sero-ai/ui';
import { GitBranch, GitCommitHorizontal } from 'lucide-react';
import type { GitAppState } from '../../shared/types';
import { DEFAULT_GIT_STATE, normalizeGitState } from '../../shared/types';
import { relativeTime } from '../lib/format';
import '../styles.css';

/** How many commits the feed peeks before "+N more". */
const SHOWN = 5;

export function GitCommitsWidget() {
  const [rawState] = useAppState<GitAppState>(DEFAULT_GIT_STATE);
  const state = normalizeGitState(rawState);
  const commits = state.commits;

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline justify="between" align="center">
          <Inline gap="xs" align="center" className="min-w-0">
            <Icon icon={GitBranch} size="sm" />
            <Text variant="label" truncate title={state.currentBranch}>
              {state.currentBranch || state.repoName}
            </Text>
          </Inline>
          {state.commitCount > 0 && (
            <Status tone="neutral" variant="pill">
              {state.commitCount} commits
            </Status>
          )}
        </Inline>

        <DataBoundary
          state={commits.length === 0 ? 'empty' : 'ready'}
          empty={<EmptyState icon={GitCommitHorizontal} title="No commits yet" />}
        >
          <Stack gap="none" scroll>
            <ActivityList overflowCount={Math.max(0, commits.length - SHOWN)}>
              {commits.slice(0, SHOWN).map((c) => (
                <ActivityListItem
                  key={c.hash}
                  icon={GitCommitHorizontal}
                  tone={c.hash === state.headHash ? 'info' : 'neutral'}
                  label={<span title={c.subject}>{c.subject}</span>}
                  timestamp={relativeTime(c.authorDate)}
                  detail={
                    <span>
                      <span className="font-mono">{c.shortHash}</span> · {c.authorName}
                    </span>
                  }
                />
              ))}
            </ActivityList>
          </Stack>
        </DataBoundary>
      </Stack>
    </WidgetContent>
  );
}

export default GitCommitsWidget;
