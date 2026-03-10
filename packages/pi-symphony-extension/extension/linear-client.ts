/**
 * Linear GraphQL tracker implementation.
 *
 * Implements IssueTracker for Linear:
 * - fetchCandidateIssues() — paginated query by project slug + active states
 * - fetchIssueStatesByIds(ids) — bulk state refresh for reconciliation
 * - Issue normalization: lowercase labels, blocker extraction, priority coercion
 */

import type { Issue, TrackerConfig } from '../shared/types';
import type { IssueTracker } from './tracker';
import { info, warn, error as logError } from './logger';

type LinearConfig = Extract<TrackerConfig, { kind: 'linear' }>;

const GRAPHQL_URL = 'https://api.linear.app/graphql';
const FETCH_TIMEOUT = 30_000;
const PAGE_SIZE = 50;

// ── GraphQL queries ────────────────────────────────────────────

const ISSUES_QUERY = `
  query CandidateIssues($projectSlug: String!, $states: [String!]!, $after: String, $first: Int!) {
    issues(
      filter: {
        project: { slugId: { eq: $projectSlug } }
        state: { name: { in: $states } }
      }
      first: $first
      after: $after
      orderBy: createdAt
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id identifier title description priority
        state { name }
        branchName url
        labels { nodes { name } }
        relations(type: "blocks") {
          nodes {
            relatedIssue { id identifier state { name } }
          }
        }
        createdAt updatedAt
      }
    }
  }
`;

const STATES_QUERY = `
  query IssueStates($ids: [ID!]!) {
    issues(filter: { id: { in: $ids } }) {
      nodes { id state { name } }
    }
  }
`;

// ── Helpers ────────────────────────────────────────────────────

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: { name: string };
  branchName: string | null;
  url: string | null;
  labels: { nodes: Array<{ name: string }> };
  relations: { nodes: Array<{ relatedIssue: { id: string; identifier: string; state: { name: string } } }> };
  createdAt: string;
  updatedAt: string;
}

function normalizeIssue(node: LinearIssueNode): Issue {
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    priority: node.priority,
    state: node.state.name,
    branchName: node.branchName,
    url: node.url,
    labels: node.labels.nodes.map((l) => l.name.toLowerCase()),
    blockedBy: node.relations.nodes.map((r) => ({
      id: r.relatedIssue.id,
      identifier: r.relatedIssue.identifier,
      state: r.relatedIssue.state.name,
    })),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

// ── Linear tracker ─────────────────────────────────────────────

export class LinearTracker implements IssueTracker {
  readonly kind = 'linear' as const;
  private config: LinearConfig;

  constructor(config: LinearConfig) {
    this.config = config;
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const issues: Issue[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 20; page++) {
      const variables: Record<string, unknown> = {
        projectSlug: this.config.project_slug,
        states: this.config.active_states,
        first: PAGE_SIZE,
      };
      if (cursor) variables.after = cursor;

      const data = await this.graphql(ISSUES_QUERY, variables);
      const connection = data?.issues;
      if (!connection?.nodes) break;

      for (const node of connection.nodes) {
        issues.push(normalizeIssue(node as LinearIssueNode));
      }

      if (!connection.pageInfo?.hasNextPage) break;
      cursor = connection.pageInfo.endCursor;
    }

    info('linear:fetch-candidates', { count: issues.length });
    return issues;
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (ids.length === 0) return result;

    try {
      const data = await this.graphql(STATES_QUERY, { ids });
      const nodes = data?.issues?.nodes ?? [];
      for (const node of nodes) {
        if (node.id && node.state?.name) {
          result.set(node.id, node.state.name);
        }
      }
    } catch (err) {
      warn('linear:fetch-states-failed', {
        error: err instanceof Error ? err.message : String(err),
        ids: ids.length,
      });
    }

    return result;
  }

  destroy(): void {
    // No persistent connections to clean up
  }

  private async graphql(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.config.api_key,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as { data?: Record<string, unknown>; errors?: unknown[] };

      if (json.errors) {
        logError('linear:graphql-errors', { errors: json.errors });
      }

      return json.data ?? {};
    } finally {
      clearTimeout(timeout);
    }
  }
}
