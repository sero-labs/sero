/**
 * A gateway stand-in for the visual tests.
 *
 * It speaks only the requests the shell makes on load, and answers with
 * fixed data. Fixed data is the point: a screenshot has to look the same
 * on every run, so nothing here uses the clock or a random value.
 */

import { WebSocketServer, type WebSocket } from 'ws';

/** Accepted. The shell only needs one to get past auth. */
export const TEST_TOKEN = 'visual-test-token';

/**
 * Refused, the way the host refuses a pairing it no longer holds.
 *
 * A revoked or expired token gets exactly this message, and the client
 * treats it as the one reason to give a saved pairing up.
 *
 * The refusal is held back, which is what a restart does in real use: a
 * tab keeps retrying while the desktop is down, so its refusal arrives
 * long after it was sent, possibly after another tab has paired again.
 */
export const STALE_TOKEN = 'stale-test-token';

/** How long the refusal is held back. Long enough to pair in between. */
const STALE_REFUSAL_DELAY_MS = 4_000;

/** A fixed instant, so every "ago" label reads the same on every run. */
const NOW = Date.parse('2026-03-01T12:00:00.000Z');

const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const WORKSPACES = [
  { id: 'meridian', name: 'Meridian', path: '/work/meridian' },
  { id: 'sero-docs', name: 'sero-docs', path: '/work/sero-docs' },
];

const SESSIONS: Record<string, unknown[]> = {
  meridian: [
    {
      id: 's1',
      name: 'Align the remote shell',
      firstMessage: 'align the shell',
      workspaceId: 'meridian',
      updatedAt: minutesAgo(2),
      messageCount: 18,
    },
    {
      id: 's2',
      name: 'Gateway token scopes',
      firstMessage: 'scopes',
      workspaceId: 'meridian',
      updatedAt: minutesAgo(63),
      messageCount: 42,
    },
  ],
  'sero-docs': [
    {
      id: 's3',
      name: 'Remote control guide',
      firstMessage: 'guide',
      workspaceId: 'sero-docs',
      updatedAt: minutesAgo(300),
      messageCount: 12,
    },
  ],
};

const HISTORY = [
  { id: 'm1', type: 'user', text: 'Align the remote sidebar with the desktop tree.', timestamp: 1 },
  {
    id: 'm2',
    type: 'assistant',
    text: [
      '### Sidebar parity',
      '',
      'The tree now uses the desktop rows. Two things changed:',
      '',
      '- `WorkspaceNode` keeps the chevron, the folder and the hover `Plus`.',
      '- `SessionNode` gains the active rail and the *time · N msgs* subtitle.',
    ].join('\n'),
    timestamp: 2,
  },
];

const NOTIFICATIONS = [
  {
    type: 'notification',
    id: 'n1',
    ts: NOW - 3 * 3_600_000,
    source: 'Reminder',
    notificationType: 'info',
    message: 'Stand-up notes are due',
    workspaceId: 'meridian',
    read: false,
  },
  {
    type: 'notification',
    id: 'n2',
    ts: NOW - 40 * 60_000,
    source: 'Workspace',
    notificationType: 'warning',
    message: 'Failed to recreate the container. Changes apply on the next restart.',
    workspaceId: 'sero-docs',
    read: false,
  },
];

const GIT_STATUS = {
  branch: 'feat/web-remote',
  ahead: 2,
  behind: 0,
  detached: false,
  merging: false,
  files: [
    { path: 'apps/web-remote/src/App.tsx', status: 'modified', staged: false },
    { path: 'apps/web-remote/src/stores/board.ts', status: 'added', staged: true },
  ],
};

/**
 * Model groups the picker shows. Logos are empty on purpose: the phone
 * hides them, and the tests must not reach out to models.dev.
 */
const MODEL_GROUPS = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: '',
    models: [
      { provider: 'anthropic', modelId: 'claude-opus-5', name: 'Claude Opus 5', reasoning: true },
      { provider: 'anthropic', modelId: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: true },
      { provider: 'anthropic', modelId: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', reasoning: false },
    ],
  },
  {
    provider: 'openai',
    displayName: 'OpenAI',
    logo: '',
    models: [
      { provider: 'openai', modelId: 'gpt-5', name: 'GPT-5', reasoning: true },
      { provider: 'openai', modelId: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: false },
    ],
  },
];

type SessionModel = ReturnType<typeof freshSessionModel>;

/**
 * The model state a connection starts with.
 *
 * One state per connection, not one per server: the server outlives the
 * run and a change made by one test must not reach the next.
 */
function freshSessionModel() {
  return {
    provider: 'anthropic',
    modelId: 'claude-opus-5',
    name: 'Claude Opus 5',
    reasoning: true,
    thinkingLevel: 'high',
    availableThinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    availableModels: MODEL_GROUPS,
  };
}

/** Answer a model request, applying the change the phone asked for. */
function answerModel(request: GatewayTestRequest, state: SessionModel): unknown {
  if (request.type === 'set_session_model' && request.provider && request.modelId) {
    const model = MODEL_GROUPS
      .flatMap((group) => group.models)
      .find((candidate) => candidate.modelId === request.modelId);
    state.provider = request.provider;
    state.modelId = request.modelId;
    state.name = model?.name ?? request.modelId;
    state.reasoning = model?.reasoning ?? false;
  }
  if (request.type === 'set_session_thinking' && request.level) {
    state.thinkingLevel = request.level;
  }
  return { ...state };
}

/** Which entries a request removes, or null when it removes none. */
function removalIds(
  request: GatewayTestRequest,
  feed: Array<{ id: string; read?: boolean }>,
): string[] | null {
  if (request.type === 'dismiss_notifications') {
    const wanted = request.ids ?? [];
    return feed.filter((entry) => wanted.includes(entry.id)).map((entry) => entry.id);
  }
  if (request.type === 'clear_read_notifications') {
    return feed.filter((entry) => entry.read === true).map((entry) => entry.id);
  }
  return null;
}

/** The answers, keyed by request type. `undefined` means "no answer". */
/** Every field the stand-in reads off the wire. */
interface GatewayTestRequest {
  type: string;
  requestId?: string;
  token?: string;
  workspaceId?: string;
  sessionId?: string;
  provider?: string;
  modelId?: string;
  level?: string;
  ids?: string[];
}

function answerFor(
  request: GatewayTestRequest,
  model: SessionModel,
  feed: typeof NOTIFICATIONS,
): unknown {
  switch (request.type) {
    case 'connect':
      return {};
    case 'list_workspaces':
      return WORKSPACES;
    case 'list_sessions':
      return SESSIONS[request.workspaceId ?? ''] ?? [];
    case 'get_session_history':
      return HISTORY;
    case 'list_notifications':
      return feed;
    case 'get_usage':
      return { totalCostUsd: 1.24, totalTokens: 184_320, sessionCount: 3 };
    case 'git_status':
      return GIT_STATUS;
    case 'list_remote_widgets':
      return [];
    case 'push_status':
      return { enabled: false, publicKey: null };
    case 'voice_status':
      return { enabled: false, reason: 'Not configured for tests.' };
    case 'list_files':
      return { entries: [] };
    case 'list_artifacts':
      return [];
    case 'list_dev_servers':
      return [];
    case 'mark_notifications_read':
      return { ids: [] };
    case 'delete_session':
      return { sessionId: request.sessionId };
    case 'get_session_model':
    case 'set_session_model':
    case 'set_session_thinking':
      return answerModel(request, model);
    default:
      return {};
  }
}

export interface TestGateway {
  port: number;
  close: () => Promise<void>;
}

/** Start the stand-in. The caller closes it when the run ends. */
export async function startTestGateway(port: number): Promise<TestGateway> {
  const server = new WebSocketServer({ port, host: '127.0.0.1' });

  server.on('connection', (socket: WebSocket) => {
    // One model state per connection, so each test starts from the same
    // model whatever the test before it changed.
    const model = freshSessionModel();
    // The feed the host holds for this connection, same reasoning.
    let feed = NOTIFICATIONS.map((entry) => ({ ...entry }));

    socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as GatewayTestRequest;

      if (request.type === 'connect' && request.token === STALE_TOKEN) {
        setTimeout(() => {
          if (socket.readyState !== socket.OPEN) return;
          socket.send(JSON.stringify({
            type: 'error',
            requestType: 'connect',
            message: 'Invalid authentication token',
          }));
          socket.close(4003, 'Authentication failed');
        }, STALE_REFUSAL_DELAY_MS);
        return;
      }

      // Removals are answered, then announced. The client drops rows on
      // the announcement, never on the response, so a stub that only
      // replied would prove nothing.
      const removed = removalIds(request, feed);
      if (removed) {
        feed = feed.filter((entry) => !removed.includes(entry.id));
      }

      socket.send(JSON.stringify({
        type: 'ok',
        requestType: request.type,
        ...(request.requestId ? { requestId: request.requestId } : {}),
        data: removed ? { ids: removed } : answerFor(request, model, feed),
      }));

      if (removed && removed.length > 0) {
        socket.send(JSON.stringify({
          type: 'notifications_dismissed',
          ids: removed,
          ts: Date.now(),
        }));
      }

      if (request.type === 'mark_notifications_read') {
        const ids = request.ids ?? [];
        for (const entry of feed) {
          if (ids.includes(entry.id)) entry.read = true;
        }
        socket.send(JSON.stringify({
          type: 'notifications_read',
          ids,
          ts: Date.now(),
        }));
      }
    });
  });

  await new Promise<void>((resolve) => server.on('listening', resolve));

  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
