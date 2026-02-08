import { type ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { ContainerManager } from './container-manager';
import { SkillManager } from './skill-manager';

const WORKSPACE_DIR = '/workspace';

/**
 * Creates the bash tool — executes commands inside the container.
 */
function createBash(cm: ContainerManager, projectId: string): ToolDefinition {
  return {
    name: 'bash',
    label: 'Bash',
    description: `Execute a bash command inside the project's sandboxed container. The working directory is ${WORKSPACE_DIR}. Commands run as root in a Debian-based Linux environment.`,
    parameters: Type.Object({
      command: Type.String({ description: 'The bash command to execute' }),
      timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds (default: 120)' })),
    }),
    execute: async (_toolCallId, params: any) => {
      try {
        const result = await cm.exec(projectId, params.command, WORKSPACE_DIR);
        const output = (result.stdout + (result.stderr ? '\n' + result.stderr : '')).trim();
        const truncated = output.length > 50000 ? output.slice(-50000) + '\n[truncated]' : output;
        return {
          content: [{ type: 'text', text: truncated || (result.exitCode === 0 ? '✓ Command completed (no output)' : '✗ Command failed (no output)') }],
          details: { exitCode: result.exitCode },
          isError: result.exitCode !== 0,
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], details: {}, isError: true };
      }
    },
  };
}

/**
 * Creates the read tool — reads files from inside the container.
 */
function createRead(cm: ContainerManager, projectId: string): ToolDefinition {
  return {
    name: 'read',
    label: 'Read',
    description: `Read the contents of a file inside the project's sandboxed container. Paths are relative to ${WORKSPACE_DIR} unless absolute.`,
    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file to read' }),
      offset: Type.Optional(Type.Number({ description: 'Line number to start reading from (1-indexed)' })),
      limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read' })),
    }),
    execute: async (_toolCallId, params: any) => {
      try {
        const absPath = params.path.startsWith('/') ? params.path : `${WORKSPACE_DIR}/${params.path}`;
        const escaped = absPath.replace(/'/g, "'\\''");
        let cmd = `cat '${escaped}'`;

        if (params.offset || params.limit) {
          const start = params.offset ?? 1;
          cmd = params.limit
            ? `sed -n '${start},${start + params.limit - 1}p' '${escaped}'`
            : `tail -n +${start} '${escaped}'`;
        }

        const result = await cm.exec(projectId, cmd);
        if (result.exitCode !== 0) {
          return { content: [{ type: 'text', text: `Error reading ${params.path}: ${result.stderr}` }], details: {}, isError: true };
        }

        const truncated = result.stdout.length > 50000
          ? result.stdout.slice(0, 50000) + '\n[truncated — use offset/limit for large files]'
          : result.stdout;
        return { content: [{ type: 'text', text: truncated }], details: { path: absPath } };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], details: {}, isError: true };
      }
    },
  };
}

/**
 * Creates the write tool — writes files inside the container.
 */
function createWrite(cm: ContainerManager, projectId: string): ToolDefinition {
  return {
    name: 'write',
    label: 'Write',
    description: `Write content to a file inside the project's sandboxed container. Creates parent directories automatically. Paths relative to ${WORKSPACE_DIR}.`,
    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file to write' }),
      content: Type.String({ description: 'Content to write to the file' }),
    }),
    execute: async (_toolCallId, params: any) => {
      try {
        const absPath = params.path.startsWith('/') ? params.path : `${WORKSPACE_DIR}/${params.path}`;
        await cm.writeFile(projectId, absPath, params.content);
        return { content: [{ type: 'text', text: `Successfully wrote to ${absPath}` }], details: { path: absPath } };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error writing ${params.path}: ${err.message}` }], details: {}, isError: true };
      }
    },
  };
}

/**
 * Creates the edit tool — surgical edits to files inside the container.
 */
function createEdit(cm: ContainerManager, projectId: string): ToolDefinition {
  return {
    name: 'edit',
    label: 'Edit',
    description: `Edit a file inside the container by replacing exact text. The oldText must match exactly (including whitespace). Paths relative to ${WORKSPACE_DIR}.`,
    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file to edit' }),
      oldText: Type.String({ description: 'Exact text to find and replace' }),
      newText: Type.String({ description: 'New text to replace the old text with' }),
    }),
    execute: async (_toolCallId, params: any) => {
      try {
        const absPath = params.path.startsWith('/') ? params.path : `${WORKSPACE_DIR}/${params.path}`;
        const escaped = absPath.replace(/'/g, "'\\''");
        const readResult = await cm.exec(projectId, `cat '${escaped}'`);
        if (readResult.exitCode !== 0) {
          return { content: [{ type: 'text', text: `Error reading ${absPath}: ${readResult.stderr}` }], details: {}, isError: true };
        }
        if (!readResult.stdout.includes(params.oldText)) {
          return { content: [{ type: 'text', text: `Error: oldText not found in ${absPath}. Make sure it matches exactly.` }], details: {}, isError: true };
        }
        const newContent = readResult.stdout.replace(params.oldText, params.newText);
        await cm.writeFile(projectId, absPath, newContent);
        return { content: [{ type: 'text', text: `Successfully edited ${absPath}` }], details: { path: absPath } };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error editing ${params.path}: ${err.message}` }], details: {}, isError: true };
      }
    },
  };
}

/**
 * Creates the ls tool — list directory contents.
 */
function createLs(cm: ContainerManager, projectId: string): ToolDefinition {
  return {
    name: 'ls',
    label: 'List Directory',
    description: `List files and directories inside the container. Paths relative to ${WORKSPACE_DIR}.`,
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: 'Directory path (default: workspace root)' })),
    }),
    execute: async (_toolCallId, params: any) => {
      try {
        const absPath = params.path
          ? (params.path.startsWith('/') ? params.path : `${WORKSPACE_DIR}/${params.path}`)
          : WORKSPACE_DIR;
        const result = await cm.exec(projectId, `ls -la '${absPath.replace(/'/g, "'\\''")}'`);
        return {
          content: [{ type: 'text', text: result.stdout || '(empty directory)' }],
          details: { path: absPath },
          isError: result.exitCode !== 0,
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], details: {}, isError: true };
      }
    },
  };
}

/**
 * Creates the read_terminal tool — reads terminal output buffer.
 */
function createReadTerminal(cm: ContainerManager, projectId: string): ToolDefinition {
  return {
    name: 'read_terminal',
    label: 'Read Terminal',
    description: `Read the recent output from the project's terminal sessions. Use this to check dev server logs, build output, error messages, or any other terminal output. Returns the last N lines from all active terminals.`,
    parameters: Type.Object({
      lines: Type.Optional(Type.Number({ description: 'Number of recent lines to read (default: 80)' })),
    }),
    execute: async (_toolCallId, params: any) => {
      try {
        const output = cm.readProjectTerminalOutput(projectId, params.lines ?? 80);
        return { content: [{ type: 'text', text: output }], details: {} };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error reading terminal: ${err.message}` }], details: {}, isError: true };
      }
    },
  };
}

/**
 * Creates the read_skill tool — reads SKILL.md content.
 */
function createReadSkill(sm: SkillManager): ToolDefinition {
  return {
    name: 'read_skill',
    label: 'Read Skill',
    description: `Read the full instructions (SKILL.md) for an available skill. Use this when a task matches a skill's description and you need the detailed instructions.`,
    parameters: Type.Object({
      name: Type.String({ description: 'The skill name to load (e.g., "brave-search")' }),
    }),
    execute: async (_toolCallId, params: any) => {
      try {
        const content = sm.readSkillContent(params.name);
        if (!content) {
          return { content: [{ type: 'text', text: `Skill "${params.name}" not found or could not be read.` }], details: {}, isError: true };
        }
        return { content: [{ type: 'text', text: content }], details: { skillName: params.name } };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error reading skill: ${err.message}` }], details: {}, isError: true };
      }
    },
  };
}

/**
 * Build all container tools for a project.
 */
export function createContainerTools(
  cm: ContainerManager,
  sm: SkillManager,
  projectId: string,
): ToolDefinition[] {
  return [
    createBash(cm, projectId),
    createRead(cm, projectId),
    createWrite(cm, projectId),
    createEdit(cm, projectId),
    createLs(cm, projectId),
    createReadTerminal(cm, projectId),
    createReadSkill(sm),
  ];
}
