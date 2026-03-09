/**
 * Sero Admin — Pi extension.
 *
 * Provides a tool for reading config files, listing sessions, and
 * viewing logs. Config writes happen through the web UI only (for safety).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import { CONFIG_FILES } from '../shared/types';

// ── Helpers ────────────────────────────────────────────────

function getSeroHome(): string {
  return process.env.SERO_HOME || path.join(process.env.HOME || '~', '.sero-ui');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

// ── Tool parameters ────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum([
    'list-configs',
    'read-config',
    'list-sessions',
    'list-logs',
    'read-log',
  ] as const),
  key: Type.Optional(
    Type.String({ description: 'Config key or log filename (for read-config, read-log)' }),
  ),
  lines: Type.Optional(
    Type.Number({ description: 'Number of lines to show (for read-log, default 50)' }),
  ),
});

// ── Extension entry point ──────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'admin',
    label: 'Sero Admin',
    description: [
      'Inspect Sero configuration and session data.',
      'Actions:',
      '  list-configs — show available config files',
      '  read-config (key) — read a config file by key',
      '  list-sessions — list recent session files',
      '  list-logs — list available log files',
      '  read-log (key) — read tail of a log file',
    ].join('\n'),
    parameters: Params,

    async execute(_toolCallId, params) {
      const seroHome = getSeroHome();

      switch (params.action) {
        case 'list-configs': {
          const lines = CONFIG_FILES.map(
            (cf) => `${cf.key}: ${cf.label} — ${cf.description}`,
          );
          return {
            content: [{ type: 'text', text: lines.join('\n') }],
            details: {},
          };
        }

        case 'read-config': {
          if (!params.key) {
            return {
              content: [{ type: 'text', text: 'Error: key is required' }],
              details: {},
            };
          }
          const cf = CONFIG_FILES.find((c) => c.key === params.key);
          if (!cf) {
            return {
              content: [{ type: 'text', text: `Error: unknown config key "${params.key}"` }],
              details: {},
            };
          }
          // Sensitive files are blocked from agent/CLI access entirely
          if (cf.sensitive) {
            return {
              content: [{ type: 'text', text: `Access denied: "${cf.label}" contains sensitive data. View it in the Admin UI.` }],
              details: {},
            };
          }
          const filePath = path.resolve(seroHome, cf.relativePath);
          const content = await safeReadFile(filePath);
          if (content === null) {
            return {
              content: [{ type: 'text', text: `File not found: ${filePath}` }],
              details: {},
            };
          }
          return {
            content: [{ type: 'text', text: `# ${cf.label}\n\n${content}` }],
            details: {},
          };
        }

        case 'list-sessions': {
          const sessionsDir = path.join(seroHome, 'agent', 'sessions');
          try {
            const files = await fs.readdir(sessionsDir);
            const jsonlFiles = files
              .filter((f) => f.endsWith('.jsonl'))
              .sort()
              .reverse()
              .slice(0, 20);

            if (jsonlFiles.length === 0) {
              return {
                content: [{ type: 'text', text: 'No sessions found.' }],
                details: {},
              };
            }

            const lines: string[] = [];
            for (const f of jsonlFiles) {
              const stat = await fs.stat(path.join(sessionsDir, f));
              lines.push(`${f} (${formatBytes(stat.size)})`);
            }
            return {
              content: [{ type: 'text', text: lines.join('\n') }],
              details: {},
            };
          } catch {
            return {
              content: [{ type: 'text', text: 'Sessions directory not found.' }],
              details: {},
            };
          }
        }

        case 'list-logs': {
          const logFiles = [
            { label: 'Electron', path: '/tmp/sero-electron.log' },
            { label: 'Vite Host', path: '/tmp/sero-vite.log' },
          ];
          // Add remote logs
          try {
            const tmpFiles = await fs.readdir('/tmp');
            for (const f of tmpFiles.sort()) {
              if (f.startsWith('sero-remote-') && f.endsWith('.log')) {
                const name = f.replace('sero-remote-', '').replace('.log', '');
                logFiles.push({ label: `Remote: ${name}`, path: `/tmp/${f}` });
              }
            }
          } catch {
            // /tmp not readable — unlikely
          }

          const lines: string[] = [];
          for (const lf of logFiles) {
            try {
              const stat = await fs.stat(lf.path);
              lines.push(`${lf.label}: ${lf.path} (${formatBytes(stat.size)})`);
            } catch {
              lines.push(`${lf.label}: ${lf.path} (not found)`);
            }
          }
          return {
            content: [{ type: 'text', text: lines.join('\n') }],
            details: {},
          };
        }

        case 'read-log': {
          if (!params.key) {
            return {
              content: [{ type: 'text', text: 'Error: key (log path) is required' }],
              details: {},
            };
          }
          const logPath = params.key.startsWith('/')
            ? params.key
            : `/tmp/${params.key}`;
          const content = await safeReadFile(logPath);
          if (content === null) {
            return {
              content: [{ type: 'text', text: `Log file not found: ${logPath}` }],
              details: {},
            };
          }
          const maxLines = params.lines ?? 50;
          const allLines = content.split('\n');
          const tail = allLines.slice(-maxLines).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `# ${path.basename(logPath)} (last ${maxLines} lines)\n\n${tail}`,
              },
            ],
            details: {},
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown action: ${params.action}` }],
            details: {},
          };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('admin '));
      text += theme.fg('muted', String(args.action));
      if (args.key) text += ` ${theme.fg('dim', String(args.key))}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      const firstLine = msg.split('\n')[0] || '';
      return new Text(
        firstLine.startsWith('Error:')
          ? theme.fg('error', firstLine)
          : theme.fg('success', '✓ ') + theme.fg('muted', firstLine),
        0,
        0,
      );
    },
  });

  pi.registerCommand('admin', {
    description: 'Open admin panel info',
    handler: async () => {
      pi.sendUserMessage('List all config files using the admin tool.');
    },
  });
}
