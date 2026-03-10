/**
 * Canvas Extension — Pi extension for collaborative document editing.
 *
 * Provides tools for creating, reading, updating, and managing
 * versioned documents in a shared Canvas workspace.
 *
 * State: `<workspace>/.sero/apps/canvas/state.json`
 * Tools: canvas (list/create/update/show/delete/snapshot)
 * Commands: /canvas
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { CanvasState, CanvasDocument, DocumentVersion } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'canvas', 'state.json');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O ───────────────────────────────────────────────

async function readState(filePath: string): Promise<CanvasState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as CanvasState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: CanvasState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Tool parameters ────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['list', 'create', 'update', 'show', 'delete', 'snapshot'] as const),
  title: Type.Optional(Type.String({ description: 'Document title (for create)' })),
  content: Type.Optional(Type.String({ description: 'Document content (for create/update)' })),
  id: Type.Optional(Type.Number({ description: 'Document ID (for update/show/delete/snapshot)' })),
  type: Type.Optional(StringEnum(['text', 'code'] as const)),
  language: Type.Optional(
    StringEnum([
      'javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown', 'plaintext',
    ] as const),
  ),
  label: Type.Optional(Type.String({ description: 'Version label (for snapshot)' })),
});

// ── Helpers ────────────────────────────────────────────────

function formatDocList(state: CanvasState): string {
  if (state.documents.length === 0) {
    return 'No canvas documents yet. Use the canvas tool to create one.';
  }
  const lines = state.documents.map((d) => {
    const preview = d.content.slice(0, 60).replace(/\n/g, ' ');
    return `#${d.id}: ${d.title} [${d.type}/${d.language}] (${d.versions.length} versions)\n   "${preview}..."`;
  });
  return `Canvas documents (${state.documents.length}):\n\n${lines.join('\n\n')}`;
}

function formatDoc(doc: CanvasDocument): string {
  return [
    `# ${doc.title}`,
    `Type: ${doc.type} | Language: ${doc.language}`,
    `Versions: ${doc.versions.length} | Updated: ${doc.updatedAt}`,
    '',
    doc.content,
  ].join('\n');
}

// ── Extension ──────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let cachedPath = '';

  pi.on('session_start', async (_event, ctx) => {
    cachedPath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    cachedPath = resolveStatePath(ctx.cwd);
  });

  pi.registerTool({
    name: 'canvas',
    label: 'Canvas',
    description:
      'Manage canvas documents. Actions: list (show all), create (requires title + content), ' +
      'update (requires id + content), show (requires id), delete (requires id), ' +
      'snapshot (save a version checkpoint, requires id, optional label).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : cachedPath;
      if (!resolvedPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace cwd' }], details: {} };
      }
      cachedPath = resolvedPath;
      const state = await readState(resolvedPath);

      switch (params.action) {
        case 'list':
          return { content: [{ type: 'text', text: formatDocList(state) }], details: {} };

        case 'create': {
          if (!params.title || !params.content) {
            return { content: [{ type: 'text', text: 'Error: title and content required' }], details: {} };
          }
          const now = new Date().toISOString();
          const doc: CanvasDocument = {
            id: state.nextId,
            title: params.title,
            content: params.content,
            type: params.type ?? 'text',
            language: params.language ?? (params.type === 'code' ? 'plaintext' : 'markdown'),
            versions: [{ id: 1, content: params.content, createdAt: now, label: 'Initial' }],
            nextVersionId: 2,
            createdAt: now,
            updatedAt: now,
          };
          state.documents.push(doc);
          state.activeDocumentId = doc.id;
          state.nextId++;
          await writeState(resolvedPath, state);
          return {
            content: [{ type: 'text', text: `Created document #${doc.id}: ${doc.title}` }],
            details: {},
          };
        }

        case 'update': {
          if (params.id === undefined || !params.content) {
            return { content: [{ type: 'text', text: 'Error: id and content required' }], details: {} };
          }
          const doc = state.documents.find((d) => d.id === params.id);
          if (!doc) {
            return { content: [{ type: 'text', text: `Error: document #${params.id} not found` }], details: {} };
          }
          doc.content = params.content;
          doc.updatedAt = new Date().toISOString();
          if (params.title) doc.title = params.title;
          if (params.type) doc.type = params.type;
          if (params.language) doc.language = params.language;
          await writeState(resolvedPath, state);
          return {
            content: [{ type: 'text', text: `Updated document #${doc.id}: ${doc.title}` }],
            details: {},
          };
        }

        case 'show': {
          if (params.id === undefined) {
            return { content: [{ type: 'text', text: 'Error: id required' }], details: {} };
          }
          const doc = state.documents.find((d) => d.id === params.id);
          if (!doc) {
            return { content: [{ type: 'text', text: `Error: document #${params.id} not found` }], details: {} };
          }
          return { content: [{ type: 'text', text: formatDoc(doc) }], details: {} };
        }

        case 'delete': {
          if (params.id === undefined) {
            return { content: [{ type: 'text', text: 'Error: id required' }], details: {} };
          }
          const idx = state.documents.findIndex((d) => d.id === params.id);
          if (idx === -1) {
            return { content: [{ type: 'text', text: `Error: document #${params.id} not found` }], details: {} };
          }
          state.documents.splice(idx, 1);
          if (state.activeDocumentId === params.id) {
            state.activeDocumentId = state.documents[0]?.id ?? null;
          }
          await writeState(resolvedPath, state);
          return { content: [{ type: 'text', text: `Deleted document #${params.id}` }], details: {} };
        }

        case 'snapshot': {
          if (params.id === undefined) {
            return { content: [{ type: 'text', text: 'Error: id required' }], details: {} };
          }
          const doc = state.documents.find((d) => d.id === params.id);
          if (!doc) {
            return { content: [{ type: 'text', text: `Error: document #${params.id} not found` }], details: {} };
          }
          const version: DocumentVersion = {
            id: doc.nextVersionId,
            content: doc.content,
            createdAt: new Date().toISOString(),
            label: params.label,
          };
          doc.versions.push(version);
          doc.nextVersionId++;
          await writeState(resolvedPath, state);
          return {
            content: [{
              type: 'text',
              text: `Snapshot v${version.id} saved for "${doc.title}"${params.label ? ` (${params.label})` : ''}`,
            }],
            details: {},
          };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown action: ${params.action}` }], details: {} };
      }
    },

    renderCall(args, theme) {
      const action = (args as { action?: string }).action ?? 'list';
      const title = (args as { title?: string }).title;
      let text = theme.fg('toolTitle', theme.bold('canvas ')) + theme.fg('muted', action);
      if (title) text += ` ${theme.fg('dim', `"${title}"`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      return new Text(
        msg.startsWith('Error:')
          ? theme.fg('error', msg)
          : theme.fg('success', '✓ ') + theme.fg('muted', msg),
        0, 0,
      );
    },
  });

  pi.registerCommand('canvas', {
    description: 'Open the Canvas — collaborative document editor',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage('List all canvas documents using the canvas tool with action list.');
    },
  });
}
