import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import {
  explainNode,
  findPath,
  loadGraphResult,
  queryGraph,
  searchGraph,
} from '../plugins/sero-graphify-plugin/shared/query-engine/index';
import {
  graphifyPathsFromHome,
  workspaceGraphJson,
} from '../plugins/sero-graphify-plugin/shared/paths';
import {
  CURRENT_INDEX_MODE_VERSION,
  DEFAULT_STATE,
  type GraphifyState,
} from '../plugins/sero-graphify-plugin/shared/types';

export interface GraphifyEvalWorkspace {
  id: string;
  name: string;
  path: string;
}

export interface GraphifyEvalCliResult {
  output: string;
  exitCode: number;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'code';
  repo: string;
  source_file: string;
  description: string;
  community: number;
}

interface GraphLink {
  source: string;
  target: string;
  relation: string;
}

interface GraphData {
  directed: false;
  multigraph: false;
  graph: Record<string, never>;
  nodes: GraphNode[];
  links: GraphLink[];
}

const REMOTE_WORKSPACE_ID = 'billing-service';

function currentWorkspaceGraph(workspaceId: string): GraphData {
  return {
    directed: false,
    multigraph: false,
    graph: {},
    nodes: [
      {
        id: `${workspaceId}::createWorkspace`,
        label: 'createWorkspace',
        type: 'code',
        repo: workspaceId,
        source_file: 'src/workspace/create-workspace.ts',
        description: 'Validates a workspace request and hands it to the registry',
        community: 0,
      },
      {
        id: `${workspaceId}::persistWorkspaceRecord`,
        label: 'persistWorkspaceRecord',
        type: 'code',
        repo: workspaceId,
        source_file: 'src/workspace/registry.ts',
        description: 'Persists workspace metadata before container startup',
        community: 0,
      },
      {
        id: `${workspaceId}::startWorkspaceContainer`,
        label: 'startWorkspaceContainer',
        type: 'code',
        repo: workspaceId,
        source_file: 'src/container/start-container.ts',
        description: 'Starts the workspace container after registration',
        community: 0,
      },
      {
        id: `${workspaceId}::CheckoutClient`,
        label: 'CheckoutClient',
        type: 'code',
        repo: workspaceId,
        source_file: 'src/checkout/client.ts',
        description: 'Sends charge requests to the billing service',
        community: 1,
      },
    ],
    links: [
      {
        source: `${workspaceId}::createWorkspace`,
        target: `${workspaceId}::persistWorkspaceRecord`,
        relation: 'CALLS',
      },
      {
        source: `${workspaceId}::persistWorkspaceRecord`,
        target: `${workspaceId}::startWorkspaceContainer`,
        relation: 'CALLS',
      },
    ],
  };
}

function profileGraph(workspaceId: string): GraphData {
  const graph = currentWorkspaceGraph(workspaceId);
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: `${REMOTE_WORKSPACE_ID}::BillingGateway`,
        label: 'BillingGateway',
        type: 'code',
        repo: REMOTE_WORKSPACE_ID,
        source_file: 'src/billing/gateway.ts',
        description: 'Owns invoice charging for checkout requests',
        community: 1,
      },
    ],
    links: [
      ...graph.links,
      {
        source: `${workspaceId}::CheckoutClient`,
        target: `${REMOTE_WORKSPACE_ID}::BillingGateway`,
        relation: 'CALLS',
      },
    ],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function seedGraphifyEvalProfile(
  profileRoot: string,
  workspace: GraphifyEvalWorkspace,
): Promise<void> {
  const paths = graphifyPathsFromHome(path.join(profileRoot, 'apps', 'graphify'));
  const remotePath = path.join(path.dirname(workspace.path), REMOTE_WORKSPACE_ID);
  const state: GraphifyState = {
    ...structuredClone(DEFAULT_STATE),
    provisioning: { status: 'ready', version: 'eval-fixture' },
    workspaces: {
      [workspace.id]: {
        workspaceId: workspace.id,
        name: workspace.name,
        path: workspace.path,
        enabled: true,
        status: 'idle',
        indexModeVersion: CURRENT_INDEX_MODE_VERSION,
      },
      [REMOTE_WORKSPACE_ID]: {
        workspaceId: REMOTE_WORKSPACE_ID,
        name: 'Billing Service',
        path: remotePath,
        enabled: true,
        status: 'idle',
        indexModeVersion: CURRENT_INDEX_MODE_VERSION,
      },
    },
    profileGraph: {
      status: 'ready',
      nodes: 5,
      edges: 3,
      workspaceIds: [workspace.id, REMOTE_WORKSPACE_ID],
    },
  };

  await Promise.all([
    writeJson(paths.stateFile, state),
    writeJson(workspaceGraphJson(paths, workspace.id), currentWorkspaceGraph(workspace.id)),
    writeJson(paths.profileGraph, profileGraph(workspace.id)),
  ]);
}

function flagValue(tokens: string[], name: string): string | undefined {
  const index = tokens.indexOf(name);
  return index >= 0 ? tokens[index + 1] : undefined;
}

function commandText(tokens: string[], flag: string): string {
  return flagValue(tokens, flag) ?? tokens.slice(1).join(' ');
}

function error(message: string): GraphifyEvalCliResult {
  return { output: `ERROR: ${message}`, exitCode: 1 };
}

async function loadGraph(filePath: string) {
  const loaded = await loadGraphResult(filePath);
  return 'graph' in loaded ? loaded.graph : null;
}

export async function runGraphifyEvalCommand(
  tokens: string[],
  profileRoot: string,
  workspaceId: string,
): Promise<GraphifyEvalCliResult | null> {
  const command = tokens[0];
  const paths = graphifyPathsFromHome(path.join(profileRoot, 'apps', 'graphify'));
  const profile = async () => loadGraph(paths.profileGraph);

  if (command === 'graphify_query') {
    const question = commandText(tokens, '--question');
    if (!question) return error('Usage: graphify_query --question <text>');
    const graph = await loadGraph(workspaceGraphJson(paths, workspaceId));
    return graph
      ? { output: queryGraph(graph, question), exitCode: 0 }
      : error('Workspace graph is unavailable');
  }

  if (command === 'graphify_search') {
    const question = commandText(tokens, '--question');
    if (!question) return error('Usage: graphify_search --question <text>');
    const graph = await profile();
    return graph
      ? { output: searchGraph(graph, question).text, exitCode: 0 }
      : error('Profile graph is unavailable');
  }

  if (command === 'graphify_path') {
    const from = flagValue(tokens, '--from');
    const to = flagValue(tokens, '--to');
    if (!from || !to) return error('Usage: graphify_path --from <concept> --to <concept>');
    const graph = await profile();
    return graph
      ? { output: findPath(graph, from, to), exitCode: 0 }
      : error('Profile graph is unavailable');
  }

  if (command === 'graphify_explain') {
    const concept = commandText(tokens, '--concept');
    if (!concept) return error('Usage: graphify_explain --concept <name>');
    const graph = await profile();
    return graph
      ? { output: explainNode(graph, concept), exitCode: 0 }
      : error('Profile graph is unavailable');
  }

  if (command === 'graphify_status') {
    return {
      output: `Profile graph: ready\nWorkspaces: ${workspaceId}, ${REMOTE_WORKSPACE_ID}`,
      exitCode: 0,
    };
  }

  return null;
}
