/**
 * Container-proxied tool definitions for agent sessions.
 *
 * These replace Pi SDK's createCodingTools() — every tool executes
 * inside the workspace's container via `container exec`.
 *
 * Behaviour is aligned with Pi SDK tools (truncation, fuzzy edit
 * matching, actionable notices, etc.) so the agent gets a consistent
 * experience whether running on the host or inside a container.
 *
 * IMPORTANT: Errors are thrown (rejected), not returned with isError.
 * The Pi SDK agent-loop only sets isError=true when the tool rejects;
 * returning { isError: true } from a resolved promise is silently
 * ignored by the framework.
 *
 * Core coding tools (bash, read, write, edit) live in tools-coding.ts.
 * Workspace tools (ls, read_terminal, register_dev_server) live here.
 */

import type { Static } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { ContainerManager } from './index';
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from './truncate';
import {
  WORKSPACE_DIR,
  resolveContainerPath,
  shellEscape,
  LsParams,
  ReadTerminalParams,
  RegisterDevServerParams,
} from './tool-schemas';
import { createBash, createRead, createWrite, createEdit } from './tools-coding';

// ── Workspace tool factories ────────────────────────────────

function createLs(cm: ContainerManager, workspaceId: string): ToolDefinition {
  return {
    name: 'ls',
    label: 'ls',
    description:
      `List directory contents. Returns entries sorted alphabetically, ` +
      `with '/' suffix for directories. Includes dotfiles. Output is ` +
      `truncated to ${DEFAULT_MAX_BYTES / 1024}KB.`,
    parameters: LsParams,
    execute: async (_toolCallId, params: Static<typeof LsParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const absPath = params.path
        ? resolveContainerPath(params.path)
        : WORKSPACE_DIR;
      const escaped = shellEscape(absPath);
      const result = await cm.exec(workspaceId, `ls -1a '${escaped}'`);

      if (result.exitCode !== 0) {
        throw new Error(
          result.stderr || `Cannot list directory: ${params.path ?? WORKSPACE_DIR}`,
        );
      }

      const raw = result.stdout.trim();
      if (!raw) {
        return {
          content: [{ type: 'text', text: '(empty directory)' }],
          details: { path: absPath },
        };
      }

      // Add '/' suffix for directories (batch stat)
      const entries = raw.split('\n').filter((e) => e !== '.' && e !== '..');
      const statCmd = entries
        .map((e) => {
          const full = shellEscape(`${absPath}/${e}`);
          return `[ -d '${full}' ] && echo "${e}/" || echo "${e}"`;
        })
        .join('; ');
      const statResult =
        entries.length > 0 ? await cm.exec(workspaceId, statCmd) : null;
      const formatted = statResult?.stdout?.trim() || raw;

      // Sort alphabetically (case-insensitive)
      const sorted = formatted
        .split('\n')
        .filter(Boolean)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      const output = sorted.join('\n');
      const truncation = truncateHead(output, {
        maxLines: Number.MAX_SAFE_INTEGER,
      });
      let resultText = truncation.content;

      if (truncation.truncated) {
        resultText += `\n\n[${formatSize(DEFAULT_MAX_BYTES)} limit reached]`;
      }

      return {
        content: [{ type: 'text', text: resultText }],
        details: { path: absPath },
      };
    },
  };
}

function createReadTerminal(
  cm: ContainerManager,
  workspaceId: string,
): ToolDefinition {
  return {
    name: 'read_terminal',
    label: 'Read Terminal',
    description:
      "Read the recent output from the workspace's terminal sessions. " +
      'Use this to check dev server logs, build output, error messages, ' +
      'or any other terminal output.',
    parameters: ReadTerminalParams,
    execute: async (
      _toolCallId,
      params: Static<typeof ReadTerminalParams>,
      signal?,
    ) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const output = cm.terminals.readWorkspaceTerminalOutput(
        workspaceId,
        params.lines ?? 80,
      );
      return { content: [{ type: 'text', text: output }], details: {} };
    },
  };
}

function createRegisterDevServer(
  cm: ContainerManager,
  workspaceId: string,
): ToolDefinition {
  return {
    name: 'register_dev_server',
    label: 'Register Dev Server',
    description:
      'Register a running dev server with the host so the user can see it ' +
      'in the Dev Servers panel and stop/restart it from the UI. ' +
      'Call this AFTER successfully starting a dev server and confirming ' +
      'it is listening on a port.',
    parameters: RegisterDevServerParams,
    execute: async (
      _toolCallId,
      params: Static<typeof RegisterDevServerParams>,
      signal?,
    ) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const server = cm.devServers.register({
        workspaceId,
        name: params.name,
        port: params.port,
        command: params.command,
        framework: params.framework,
      });

      return {
        content: [
          {
            type: 'text',
            text:
              `✓ Dev server registered: ${server.name}\n` +
              `  URL: ${server.url}\n` +
              `  Port: ${server.port}\n` +
              `  Status: ${server.status}\n` +
              'The user can now manage this server from the Dev Servers panel.',
          },
        ],
        details: { serverId: server.id, url: server.url },
      };
    },
  };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Build all container tools for a workspace.
 * These are passed as `customTools` to `createAgentSession()`.
 */
export function createContainerTools(
  cm: ContainerManager,
  workspaceId: string,
): ToolDefinition[] {
  return [
    createBash(cm, workspaceId),
    createRead(cm, workspaceId),
    createWrite(cm, workspaceId),
    createEdit(cm, workspaceId),
    createLs(cm, workspaceId),
    createReadTerminal(cm, workspaceId),
    createRegisterDevServer(cm, workspaceId),
  ];
}
