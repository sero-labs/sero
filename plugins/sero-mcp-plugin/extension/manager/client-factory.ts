import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/app-bridge';
import { Client, type ClientCapabilities, type ListChangedHandlers } from '@modelcontextprotocol/client';
import { createElicitationHandler } from '../elicitation/handler';

export const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui';
export const MCP_TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
export const MCP_SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';

/** Host features that add an extension capability. Turn one on only when its host path is ready. */
export interface McpClientFeatures {
  apps: boolean;
  tasks: boolean;
  skills: boolean;
}

export const MCP_CLIENT_FEATURES: McpClientFeatures = { apps: true, tasks: false, skills: false };

const PROBE_TIMEOUT_MS = 10_000;
const MAX_INPUT_ROUNDS = 10;

export function buildClientCapabilities(features: McpClientFeatures, canElicit = false): ClientCapabilities {
  const extensions: NonNullable<ClientCapabilities['extensions']> = {};
  if (features.apps) extensions[MCP_APPS_EXTENSION] = { mimeTypes: [RESOURCE_MIME_TYPE] };
  // Tasks is not declared here: ext-tasks declares it on each request that it sends, so a
  // plain callTool (for example from an MCP app) never gets a task result it cannot read.
  if (features.skills) extensions[MCP_SKILLS_EXTENSION] = {};
  // Sero never declares the deprecated sampling or roots client features.
  return {
    ...(canElicit ? { elicitation: { form: {}, url: {} } } : {}),
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
}

export interface CreateMcpClientOptions {
  features?: McpClientFeatures;
  /** The host-assigned server label. With it, the client answers server input requests. */
  serverLabel?: string;
  /** Keeps cached responses apart per account. */
  cachePartition?: string;
  /** Called with the new list after the server reports a change. */
  listChanged?: ListChangedHandlers;
}

/** Builds every MCP client, so that negotiation and capabilities are set in one place. */
export function createMcpClient(clientName: string, options: CreateMcpClientOptions = {}): Client {
  const { features = MCP_CLIENT_FEATURES, serverLabel, cachePartition, listChanged } = options;
  const client = new Client({ name: clientName, version: '0.1.0' }, {
    capabilities: buildClientCapabilities(features, serverLabel !== undefined),
    versionNegotiation: { mode: 'auto', probe: { timeoutMs: PROBE_TIMEOUT_MS } },
    inputRequired: { maxRounds: MAX_INPUT_ROUNDS },
    ...(cachePartition ? { cachePartition } : {}),
    ...(listChanged ? { listChanged } : {}),
  });
  if (serverLabel !== undefined) {
    client.setRequestHandler('elicitation/create', createElicitationHandler(serverLabel));
  }
  return client;
}
