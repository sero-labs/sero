/**
 * A gateway stand-in for the visual tests.
 *
 * It speaks only the requests the shell makes on load, and answers with
 * fixed data. Fixed data is the point: a screenshot has to look the same
 * on every run, so nothing here uses the clock or a random value.
 */

import { WebSocketServer, type WebSocket } from 'ws';

/** Any token is accepted. The shell only needs one to get past auth. */
export const TEST_TOKEN = 'visual-test-token';

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

/** The answers, keyed by request type. `undefined` means "no answer". */
function answerFor(request: { type: string; workspaceId?: string }): unknown {
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
      return NOTIFICATIONS;
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
    socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as {
        type: string;
        requestId?: string;
        workspaceId?: string;
      };

      socket.send(JSON.stringify({
        type: 'ok',
        requestType: request.type,
        ...(request.requestId ? { requestId: request.requestId } : {}),
        data: answerFor(request),
      }));
    });
  });

  await new Promise<void>((resolve) => server.on('listening', resolve));

  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
