/**
 * Google Workspace Pi extension — Gmail + Calendar tools.
 *
 * Wraps gogcli to give the agent access to Gmail and Calendar.
 * Results are written to the app state file so the Sero web UI
 * can display them instantly via file watching.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { GoogleAppState } from '../shared/types';
import { DEFAULT_GOOGLE_STATE } from '../shared/types';
import { runGog, runGogJson } from './gogcli';

// ── State I/O ────────────────────────────────────────────────

function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'google', 'state.json');
  }
  return path.join(cwd, '.sero', 'apps', 'google', 'state.json');
}

async function readState(filePath: string): Promise<GoogleAppState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as GoogleAppState;
  } catch {
    return { ...DEFAULT_GOOGLE_STATE };
  }
}

async function writeState(filePath: string, state: GoogleAppState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Tool parameters ──────────────────────────────────────────

const GmailParams = Type.Object({
  action: StringEnum([
    'search', 'read_thread', 'send', 'archive', 'labels',
  ] as const),
  query: Type.Optional(Type.String({ description: 'Gmail search query (for search)' })),
  thread_id: Type.Optional(Type.String({ description: 'Thread ID (for read_thread, archive)' })),
  to: Type.Optional(Type.String({ description: 'Recipient email (for send)' })),
  subject: Type.Optional(Type.String({ description: 'Email subject (for send)' })),
  body: Type.Optional(Type.String({ description: 'Email body (for send)' })),
  max: Type.Optional(Type.Number({ description: 'Max results (for search, default 10)' })),
});

const CalendarParams = Type.Object({
  action: StringEnum([
    'today', 'week', 'search', 'create', 'delete', 'calendars',
  ] as const),
  query: Type.Optional(Type.String({ description: 'Search query (for search)' })),
  calendar_id: Type.Optional(Type.String({ description: 'Calendar ID (default: primary)' })),
  event_id: Type.Optional(Type.String({ description: 'Event ID (for delete)' })),
  summary: Type.Optional(Type.String({ description: 'Event title (for create)' })),
  from: Type.Optional(Type.String({ description: 'Start time ISO or natural (for create)' })),
  to: Type.Optional(Type.String({ description: 'End time ISO or natural (for create)' })),
  location: Type.Optional(Type.String({ description: 'Event location (for create)' })),
  attendees: Type.Optional(Type.String({ description: 'Comma-separated emails (for create)' })),
});

// ── Extension entry point ────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  // ── Gmail tool ─────────────────────────────────────────────

  pi.registerTool({
    name: 'gmail',
    label: 'Gmail',
    description:
      'Access Gmail. Actions: search (query emails), read_thread (get thread details), ' +
      'send (compose email), archive (remove from inbox), labels (list labels).',
    parameters: GmailParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolved = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolved) return { content: [{ type: 'text', text: 'Error: no workspace' }], details: {} };
      statePath = resolved;

      const state = await readState(statePath);

      switch (params.action) {
        case 'search': {
          const q = params.query || 'newer_than:3d';
          const max = params.max || 10;
          const result = await runGog(
            ['gmail', 'search', q, '--max', String(max)],
            { json: true },
          );
          if (result.exitCode !== 0) {
            return { content: [{ type: 'text', text: result.stderr || 'Search failed' }], details: {} };
          }
          // Store in state for UI
          try {
            const data = JSON.parse(result.stdout);
            state.gmail.threads = (data.threads || []).map((t: any) => ({
              id: t.id || '',
              snippet: t.snippet || '',
              subject: t.messages?.[0]?.subject || t.subject || '(no subject)',
              from: t.messages?.[0]?.from || t.from || '',
              date: t.messages?.[0]?.date || t.date || '',
              labelIds: t.messages?.[0]?.labels || t.labelIds || [],
              isUnread: (t.messages?.[0]?.labels || t.labelIds || []).includes('UNREAD'),
              messageCount: t.messages?.length || t.messageCount || 1,
            }));
            state.gmail.lastQuery = q;
            state.gmail.lastFetchedAt = new Date().toISOString();
            await writeState(statePath, state);
          } catch { /* output is still returned below */ }
          return { content: [{ type: 'text', text: result.stdout }], details: {} };
        }

        case 'read_thread': {
          if (!params.thread_id) return { content: [{ type: 'text', text: 'Error: thread_id required' }], details: {} };
          const result = await runGog(['gmail', 'thread', 'get', params.thread_id], { json: true });
          if (result.exitCode !== 0) {
            return { content: [{ type: 'text', text: result.stderr || 'Failed to read thread' }], details: {} };
          }
          try {
            const data = JSON.parse(result.stdout);
            state.gmail.selectedThreadId = params.thread_id;
            state.gmail.selectedMessages = (data.thread?.messages || data.messages || []).map((m: any) => ({
              id: m.id || '',
              threadId: m.threadId || params.thread_id,
              from: m.from || '',
              to: m.to || '',
              subject: m.subject || '',
              date: m.date || '',
              body: m.body || m.snippet || '',
              snippet: m.snippet || '',
            }));
            await writeState(statePath, state);
          } catch { /* pass */ }
          return { content: [{ type: 'text', text: result.stdout }], details: {} };
        }

        case 'send': {
          if (!params.to) return { content: [{ type: 'text', text: 'Error: to required' }], details: {} };
          const args = ['gmail', 'send', '--to', params.to];
          if (params.subject) args.push('--subject', params.subject);
          if (params.body) args.push('--body', params.body);
          const result = await runGog(args, { json: true });
          const text = result.exitCode === 0 ? 'Email sent successfully' : (result.stderr || 'Send failed');
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'archive': {
          if (!params.thread_id) return { content: [{ type: 'text', text: 'Error: thread_id required' }], details: {} };
          const result = await runGog(
            ['gmail', 'labels', 'modify', params.thread_id, '--remove', 'INBOX'],
            { json: true },
          );
          const text = result.exitCode === 0 ? `Archived thread ${params.thread_id}` : (result.stderr || 'Archive failed');
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'labels': {
          const result = await runGog(['gmail', 'labels', 'list'], { json: true });
          return { content: [{ type: 'text', text: result.stdout || result.stderr }], details: {} };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown gmail action: ${params.action}` }], details: {} };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('gmail '));
      text += theme.fg('muted', args.action);
      if (args.query) text += ` ${theme.fg('dim', `"${args.query}"`)}`;
      if (args.to) text += ` ${theme.fg('dim', `→ ${args.to}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const first = result.content[0];
      const msg = first?.type === 'text' ? first.text : '';
      const short = msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
      return new Text(
        msg.startsWith('Error') ? theme.fg('error', short) : theme.fg('success', '✓ ') + theme.fg('muted', short),
        0, 0,
      );
    },
  });

  // ── Calendar tool ──────────────────────────────────────────

  pi.registerTool({
    name: 'gcal',
    label: 'Google Calendar',
    description:
      'Access Google Calendar. Actions: today (today\'s events), week (this week), ' +
      'search (find events), create (new event), delete (remove event), calendars (list).',
    parameters: CalendarParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolved = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolved) return { content: [{ type: 'text', text: 'Error: no workspace' }], details: {} };
      statePath = resolved;

      const state = await readState(statePath);
      const calId = params.calendar_id || 'primary';

      switch (params.action) {
        case 'today':
        case 'week': {
          const flag = params.action === 'today' ? '--today' : '--week';
          const result = await runGog(['calendar', 'events', calId, flag], { json: true });
          if (result.exitCode !== 0) {
            return { content: [{ type: 'text', text: result.stderr || 'Failed to fetch events' }], details: {} };
          }
          try {
            const data = JSON.parse(result.stdout);
            state.calendar.events = (data.events || []).map((e: any) => ({
              id: e.id || '',
              calendarId: calId,
              summary: e.summary || '(no title)',
              start: e.start?.dateTime || e.start?.date || e.startLocal || '',
              end: e.end?.dateTime || e.end?.date || e.endLocal || '',
              startLocal: e.startLocal || '',
              endLocal: e.endLocal || '',
              location: e.location || '',
              description: e.description || '',
              attendees: e.attendees?.map((a: any) => a.email || a) || [],
              isAllDay: !!e.start?.date && !e.start?.dateTime,
              status: e.status || '',
            }));
            state.calendar.view = params.action;
            state.calendar.lastFetchedAt = new Date().toISOString();
            await writeState(statePath, state);
          } catch { /* pass */ }
          return { content: [{ type: 'text', text: result.stdout }], details: {} };
        }

        case 'search': {
          if (!params.query) return { content: [{ type: 'text', text: 'Error: query required' }], details: {} };
          const result = await runGog(['calendar', 'search', params.query], { json: true });
          return { content: [{ type: 'text', text: result.stdout || result.stderr }], details: {} };
        }

        case 'create': {
          if (!params.summary || !params.from || !params.to) {
            return { content: [{ type: 'text', text: 'Error: summary, from, to required' }], details: {} };
          }
          const args = ['calendar', 'create', calId, '--summary', params.summary, '--from', params.from, '--to', params.to];
          if (params.location) args.push('--location', params.location);
          if (params.attendees) args.push('--attendees', params.attendees);
          const result = await runGog(args, { json: true });
          const text = result.exitCode === 0 ? `Created: ${params.summary}` : (result.stderr || 'Create failed');
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'delete': {
          if (!params.event_id) return { content: [{ type: 'text', text: 'Error: event_id required' }], details: {} };
          const result = await runGog(['calendar', 'delete', calId, params.event_id], { json: false });
          const text = result.exitCode === 0 ? `Deleted event ${params.event_id}` : (result.stderr || 'Delete failed');
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'calendars': {
          const result = await runGog(['calendar', 'calendars'], { json: true });
          try {
            const data = JSON.parse(result.stdout);
            state.calendar.calendars = (data.calendars || []).map((c: any) => ({
              id: c.id || '',
              summary: c.summary || c.id || '',
              primary: !!c.primary,
            }));
            await writeState(statePath, state);
          } catch { /* pass */ }
          return { content: [{ type: 'text', text: result.stdout || result.stderr }], details: {} };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown calendar action: ${params.action}` }], details: {} };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('gcal '));
      text += theme.fg('muted', args.action);
      if (args.summary) text += ` ${theme.fg('dim', `"${args.summary}"`)}`;
      if (args.query) text += ` ${theme.fg('dim', `"${args.query}"`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const first = result.content[0];
      const msg = first?.type === 'text' ? first.text : '';
      const short = msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
      return new Text(
        msg.startsWith('Error') ? theme.fg('error', short) : theme.fg('success', '✓ ') + theme.fg('muted', short),
        0, 0,
      );
    },
  });

  // ── Commands ───────────────────────────────────────────────

  pi.registerCommand('gmail', {
    description: 'Search recent Gmail inbox',
    handler: async () => {
      pi.sendUserMessage('Search my recent Gmail inbox using the gmail tool with action search.');
    },
  });

  pi.registerCommand('gcal', {
    description: 'Show today\'s calendar events',
    handler: async () => {
      pi.sendUserMessage('Show today\'s calendar events using the gcal tool with action today.');
    },
  });
}
