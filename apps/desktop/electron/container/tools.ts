/**
 * Container-proxied tool definitions for agent sessions.
 *
 * These replace Pi SDK's createCodingTools() — every tool executes
 * inside the workspace's container via `container exec`.
 */

import { Type, type Static } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { ContainerManager } from './index';

const WORKSPACE_DIR = '/workspace';

// ── Tool parameter schemas (extracted so Static<> can infer) ──

const BashParams = Type.Object({
  command: Type.String({ description: 'The bash command to execute' }),
  timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds (default: 120)' })),
});

const ReadParams = Type.Object({
  path: Type.String({ description: 'Path to the file to read' }),
  offset: Type.Optional(
    Type.Number({ description: 'Line number to start reading from (1-indexed)' }),
  ),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read' })),
});

const WriteParams = Type.Object({
  path: Type.String({ description: 'Path to the file to write' }),
  content: Type.String({ description: 'Content to write to the file' }),
});

const EditParams = Type.Object({
  path: Type.String({ description: 'Path to the file to edit' }),
  oldText: Type.String({ description: 'Exact text to find and replace' }),
  newText: Type.String({ description: 'New text to replace the old text with' }),
});

const LsParams = Type.Object({
  path: Type.Optional(
    Type.String({ description: 'Directory path (default: workspace root)' }),
  ),
});

const ReadTerminalParams = Type.Object({
  lines: Type.Optional(
    Type.Number({ description: 'Number of recent lines to read (default: 80)' }),
  ),
});

// ── Helpers ──────────────────────────────────────────────────

/** Resolve a potentially relative path against the workspace root. */
function resolveContainerPath(p: string): string {
  return p.startsWith('/') ? p : `${WORKSPACE_DIR}/${p}`;
}

/** Shell-escape single quotes in a path. */
function shellEscape(p: string): string {
  return p.replace(/'/g, "'\\''");
}

/** Format an error into a tool result. */
function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    details: {},
    isError: true,
  };
}

// ── Tool factories ──────────────────────────────────────────

/** Create the bash tool — executes commands inside the container. */
function createBash(cm: ContainerManager, workspaceId: string): ToolDefinition {
  return {
    name: 'bash',
    label: 'Bash',
    description: `Execute a bash command inside the workspace's sandboxed Linux container. The working directory is ${WORKSPACE_DIR}. Commands run as root in a Debian-based environment (node:22-slim).`,
    parameters: BashParams,
    execute: async (_toolCallId, params: Static<typeof BashParams>) => {
      try {
        const timeoutMs = params.timeout ? params.timeout * 1000 : undefined;
        const result = await cm.exec(workspaceId, params.command, WORKSPACE_DIR, timeoutMs);
        const output = (result.stdout + (result.stderr ? '\n' + result.stderr : '')).trim();
        const truncated =
          output.length > 50000 ? output.slice(-50000) + '\n[truncated]' : output;

        let displayText: string;
        if (truncated) {
          displayText = truncated;
        } else if (result.exitCode === 0) {
          displayText = '✓ Command completed (no output)';
        } else {
          displayText = `✗ Command failed with exit code ${result.exitCode} (no output)`;
        }

        // Append detected dev server URLs (from last scan, no blocking wait)
        const ports = cm.portScanner.getPorts(workspaceId);
        if (ports.length > 0) {
          const lines = ports.map((p) => `  ${p.url}  (port ${p.port})`);
          displayText += `\n\n[Dev servers]\n${lines.join('\n')}`;
        }

        // Trigger a background scan for the *next* bash call to pick up
        cm.portScanner.triggerScan(workspaceId);

        return {
          content: [{ type: 'text', text: displayText }],
          details: { exitCode: result.exitCode },
          isError: result.exitCode !== 0,
        };
      } catch (err: unknown) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

/** Create the read tool — reads files from inside the container. */
function createRead(cm: ContainerManager, workspaceId: string): ToolDefinition {
  return {
    name: 'read',
    label: 'Read',
    description: `Read the contents of a file inside the container. Paths are relative to ${WORKSPACE_DIR} unless absolute.`,
    parameters: ReadParams,
    execute: async (_toolCallId, params: Static<typeof ReadParams>) => {
      try {
        const absPath = resolveContainerPath(params.path);
        const escaped = shellEscape(absPath);
        let cmd = `cat '${escaped}'`;

        if (params.offset || params.limit) {
          const start = params.offset ?? 1;
          cmd = params.limit
            ? `sed -n '${start},${start + params.limit - 1}p' '${escaped}'`
            : `tail -n +${start} '${escaped}'`;
        }

        const result = await cm.exec(workspaceId, cmd);
        if (result.exitCode !== 0) {
          return errorResult(`Error reading ${params.path}: ${result.stderr}`);
        }

        const truncated =
          result.stdout.length > 50000
            ? result.stdout.slice(0, 50000) + '\n[truncated — use offset/limit for large files]'
            : result.stdout;
        return { content: [{ type: 'text', text: truncated }], details: { path: absPath } };
      } catch (err: unknown) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

/** Create the write tool — writes files inside the container. */
function createWrite(cm: ContainerManager, workspaceId: string): ToolDefinition {
  return {
    name: 'write',
    label: 'Write',
    description: `Write content to a file inside the container. Creates parent directories automatically. Paths relative to ${WORKSPACE_DIR}.`,
    parameters: WriteParams,
    execute: async (_toolCallId, params: Static<typeof WriteParams>) => {
      try {
        const absPath = resolveContainerPath(params.path);
        await cm.writeFile(workspaceId, absPath, params.content);
        return {
          content: [{ type: 'text', text: `Successfully wrote to ${absPath}` }],
          details: { path: absPath },
        };
      } catch (err: unknown) {
        return errorResult(`Error writing ${params.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

/** Create the edit tool — surgical edits to files inside the container. */
function createEdit(cm: ContainerManager, workspaceId: string): ToolDefinition {
  return {
    name: 'edit',
    label: 'Edit',
    description: `Edit a file inside the container by replacing exact text. The oldText must match exactly (including whitespace). Paths relative to ${WORKSPACE_DIR}.`,
    parameters: EditParams,
    execute: async (_toolCallId, params: Static<typeof EditParams>) => {
      try {
        const absPath = resolveContainerPath(params.path);
        const escaped = shellEscape(absPath);
        const readResult = await cm.exec(workspaceId, `cat '${escaped}'`);
        if (readResult.exitCode !== 0) {
          return errorResult(`Error reading ${absPath}: ${readResult.stderr}`);
        }
        if (!readResult.stdout.includes(params.oldText)) {
          return errorResult(
            `Error: oldText not found in ${absPath}. Make sure it matches exactly.`,
          );
        }
        const newContent = readResult.stdout.replace(params.oldText, params.newText);
        await cm.writeFile(workspaceId, absPath, newContent);
        return {
          content: [{ type: 'text', text: `Successfully edited ${absPath}` }],
          details: { path: absPath },
        };
      } catch (err: unknown) {
        return errorResult(`Error editing ${params.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

/** Create the ls tool — list directory contents. */
function createLs(cm: ContainerManager, workspaceId: string): ToolDefinition {
  return {
    name: 'ls',
    label: 'List Directory',
    description: `List files and directories inside the container. Paths relative to ${WORKSPACE_DIR}.`,
    parameters: LsParams,
    execute: async (_toolCallId, params: Static<typeof LsParams>) => {
      try {
        const absPath = params.path ? resolveContainerPath(params.path) : WORKSPACE_DIR;
        const escaped = shellEscape(absPath);
        const result = await cm.exec(workspaceId, `ls -la '${escaped}'`);
        return {
          content: [{ type: 'text', text: result.stdout || '(empty directory)' }],
          details: { path: absPath },
          isError: result.exitCode !== 0,
        };
      } catch (err: unknown) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

/** Create the read_terminal tool — reads terminal output buffer. */
function createReadTerminal(cm: ContainerManager, workspaceId: string): ToolDefinition {
  return {
    name: 'read_terminal',
    label: 'Read Terminal',
    description:
      "Read the recent output from the workspace's terminal sessions. Use this to check dev server logs, build output, error messages, or any other terminal output.",
    parameters: ReadTerminalParams,
    execute: async (_toolCallId, params: Static<typeof ReadTerminalParams>) => {
      try {
        const output = cm.terminals.readWorkspaceTerminalOutput(workspaceId, params.lines ?? 80);
        return { content: [{ type: 'text', text: output }], details: {} };
      } catch (err: unknown) {
        return errorResult(`Error reading terminal: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

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
  ];
}
