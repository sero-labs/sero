/**
 * Catalog of the event sources loops can subscribe to (spec 12 Phase 5).
 *
 * This is the ONLY place the available sources are described for prompts: the
 * trigger extractor and the planner both inject the same block, so the model —
 * never code — maps the user's plain language onto a source, filter, and
 * condition. Filter fields listed here mirror the payloads the adapters and
 * lifecycle emitter actually produce.
 */

export interface EventSourceInfo {
  /** Namespaced source id, or a `webhook:<name>` template. */
  source: string;
  description: string;
  /** Top-level payload fields a structured `eventFilter` can match. */
  filterFields?: string;
}

export const EVENT_SOURCE_CATALOG: EventSourceInfo[] = [
  {
    source: 'loop:completed',
    description: 'another loop in this workspace completed a run',
    filterFields: 'loopId, title, runNumber, reason',
  },
  {
    source: 'loop:blocked',
    description: 'another loop hit a blocker',
    filterFields: 'loopId, title, runNumber, reason',
  },
  {
    source: 'loop:asked-question',
    description: 'another loop asked the user a question',
    filterFields: 'loopId, title, stepId',
  },
  {
    source: 'fs:changed',
    description:
      'files changed in the workspace (one debounced batch; payload lists the changed paths). To scope to a folder or file type, use an eventCondition like "only when files under docs/ changed" — the filter cannot express path prefixes',
    filterFields: 'count',
  },
  {
    source: 'github:pr-opened',
    description: 'a pull request was opened on the workspace repo',
    filterFields: 'number, title, author, branch, baseBranch, draft',
  },
  {
    source: 'github:ci-failed',
    description: 'a CI workflow run completed with a failure',
    filterFields: 'workflow, conclusion, branch, sha',
  },
  {
    source: 'github:ci-passed',
    description: 'a CI workflow run completed successfully',
    filterFields: 'workflow, conclusion, branch, sha',
  },
  {
    source: 'github:issue-labelled',
    description: 'an issue or PR was given a label',
    filterFields: 'issueNumber, issueTitle, label, isPullRequest',
  },
  {
    source: 'github:review-requested',
    description: 'a review was requested on a pull request',
    filterFields: 'prNumber, prTitle, requestedReviewer',
  },
  {
    source: 'github:review-comment',
    description: 'a review comment was posted on a pull request',
    filterFields: 'prNumber, author, path',
  },
  {
    source: 'github:pr-approved',
    description: 'a pull request review was submitted approving the PR',
    filterFields: 'prNumber, prTitle, reviewer',
  },
  {
    source: 'github:main-updated',
    description: 'commits were pushed to the repo default branch',
    filterFields: 'branch, pusher, commitCount',
  },
  {
    source: 'github:issue-opened',
    description: 'an issue was opened on the workspace repo (never fires for pull requests)',
    filterFields: 'number, title, author, labels',
  },
  {
    source: 'webhook:<name>',
    description:
      'an external system POSTed JSON to the local hook endpoint /hooks/<name> — invent a short kebab-case name for <name> (e.g. webhook:deploy); the JSON body is the payload',
  },
];

/** Renders the EVENT SOURCES block injected into extractor and planner prompts. */
export function buildEventSourceCatalogBlock(): string {
  const lines = EVENT_SOURCE_CATALOG.map((entry) => {
    const fields = entry.filterFields ? ` Filterable payload fields: ${entry.filterFields}.` : '';
    return `- ${entry.source}: ${entry.description}.${fields}`;
  });
  return `EVENT SOURCES available in this workspace (exact ids; nothing else exists):
${lines.join('\n')}`;
}
