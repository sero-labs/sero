import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createReadTool,
  createWriteTool,
  createEditTool,
  type ToolDefinition,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { ContainerManager } from './container-manager';
import { SkillManager } from './skill-manager';

const WORKSPACE_DIR = '/workspace';

/**
 * Manages Pi agent sessions — one (or more, in future) per project.
 * Each agent's tools execute inside the project's container.
 */
export class AgentManager {
  private sessions = new Map<string, AgentSession>();
  private listeners = new Map<string, (() => void)[]>();
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;

  constructor(
    private containerManager: ContainerManager,
    private skillManager: SkillManager,
  ) {
    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);
  }

  /**
   * Create a new agent session for a project.
   * Tools are wired to execute inside the project's container.
   */
  async createSession(projectId: string): Promise<void> {
    if (this.sessions.has(projectId)) {
      return; // Already exists
    }

    const tools = this.createContainerTools(projectId);

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 },
    });

    const loader = new DefaultResourceLoader({
      cwd: WORKSPACE_DIR,
      settingsManager,
      systemPromptOverride: () => this.buildSystemPrompt(projectId),
    });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd: WORKSPACE_DIR,
      sessionManager: SessionManager.inMemory(),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      customTools: tools,
      resourceLoader: loader,
      settingsManager,
    });

    this.sessions.set(projectId, session);
  }

  /**
   * Subscribe to agent events for a project.
   * Returns unsubscribe function.
   */
  subscribe(projectId: string, listener: (event: AgentSessionEvent) => void): () => void {
    const session = this.sessions.get(projectId);
    if (!session) throw new Error(`No agent session for project ${projectId}`);

    const unsub = session.subscribe(listener);
    const existing = this.listeners.get(projectId) ?? [];
    existing.push(unsub);
    this.listeners.set(projectId, existing);
    return unsub;
  }

  /**
   * Send a prompt to the project's agent.
   * If the session is disposed or in a bad state, recreate it.
   */
  async prompt(projectId: string, message: string): Promise<void> {
    let session = this.sessions.get(projectId);
    if (!session) throw new Error(`No agent session for project ${projectId}`);

    try {
      if (session.isStreaming) {
        await session.followUp(message);
      } else {
        await session.prompt(message);
      }
    } catch (err: any) {
      // If session is in a broken state, try to recreate and retry once
      console.error(`Agent prompt failed for ${projectId}:`, err?.message);

      // Attempt session recreation
      try {
        this.dispose(projectId);
        await this.createSession(projectId);
        session = this.sessions.get(projectId);
        if (session) {
          // Re-subscribe — the IPC handler will need to call subscribe again
          // For now, just re-prompt
          await session.prompt(message);
        } else {
          throw err; // Rethrow original
        }
      } catch (retryErr) {
        console.error(`Agent session recreation failed for ${projectId}:`, retryErr);
        throw err; // Throw original error
      }
    }
  }

  /**
   * Abort the current agent operation.
   */
  async abort(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId);
    if (session) {
      await session.abort();
    }
  }

  /**
   * Remove all event subscriptions for a project (without disposing the session).
   */
  unsubscribeAll(projectId: string): void {
    const unsubs = this.listeners.get(projectId);
    if (unsubs) {
      unsubs.forEach(fn => fn());
      this.listeners.delete(projectId);
    }
  }

  /**
   * Dispose a single project's agent session.
   */
  dispose(projectId: string): void {
    const unsubs = this.listeners.get(projectId);
    if (unsubs) {
      unsubs.forEach(fn => fn());
      this.listeners.delete(projectId);
    }
    const session = this.sessions.get(projectId);
    if (session) {
      session.dispose();
      this.sessions.delete(projectId);
    }
  }

  /**
   * Dispose all sessions (app shutdown).
   */
  disposeAll(): void {
    for (const projectId of this.sessions.keys()) {
      this.dispose(projectId);
    }
  }

  /**
   * Check if a project has an active agent session.
   */
  hasSession(projectId: string): boolean {
    return this.sessions.has(projectId);
  }

  /**
   * Build tools that execute inside the project's container.
   */
  private createContainerTools(projectId: string): ToolDefinition[] {
    const cm = this.containerManager;

    // Bash tool — executes commands inside the container
    const bashTool: ToolDefinition = {
      name: 'bash',
      label: 'Bash',
      description: `Execute a bash command inside the project's sandboxed container. The working directory is ${WORKSPACE_DIR}. Commands run as root in a Debian-based Linux environment.`,
      parameters: Type.Object({
        command: Type.String({ description: 'The bash command to execute' }),
        timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds (default: 120)' })),
      }),
      execute: async (toolCallId, params: any, signal, onUpdate) => {
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
          return {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            details: {},
            isError: true,
          };
        }
      },
    };

    // Read tool — reads files from inside the container
    const readTool: ToolDefinition = {
      name: 'read',
      label: 'Read',
      description: `Read the contents of a file inside the project's sandboxed container. Paths are relative to ${WORKSPACE_DIR} unless absolute.`,
      parameters: Type.Object({
        path: Type.String({ description: 'Path to the file to read' }),
        offset: Type.Optional(Type.Number({ description: 'Line number to start reading from (1-indexed)' })),
        limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read' })),
      }),
      execute: async (toolCallId, params: any) => {
        try {
          const absPath = params.path.startsWith('/') ? params.path : `${WORKSPACE_DIR}/${params.path}`;
          let cmd = `cat '${absPath.replace(/'/g, "'\\''")}'`;

          if (params.offset || params.limit) {
            const start = params.offset ?? 1;
            if (params.limit) {
              cmd = `sed -n '${start},${start + params.limit - 1}p' '${absPath.replace(/'/g, "'\\''")}'`;
            } else {
              cmd = `tail -n +${start} '${absPath.replace(/'/g, "'\\''")}'`;
            }
          }

          const result = await cm.exec(projectId, cmd);
          if (result.exitCode !== 0) {
            return {
              content: [{ type: 'text', text: `Error reading ${params.path}: ${result.stderr}` }],
              details: {},
              isError: true,
            };
          }

          const truncated = result.stdout.length > 50000
            ? result.stdout.slice(0, 50000) + '\n[truncated — use offset/limit for large files]'
            : result.stdout;

          return {
            content: [{ type: 'text', text: truncated }],
            details: { path: absPath },
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            details: {},
            isError: true,
          };
        }
      },
    };

    // Write tool — writes files inside the container
    const writeTool: ToolDefinition = {
      name: 'write',
      label: 'Write',
      description: `Write content to a file inside the project's sandboxed container. Creates parent directories automatically. Paths relative to ${WORKSPACE_DIR}.`,
      parameters: Type.Object({
        path: Type.String({ description: 'Path to the file to write' }),
        content: Type.String({ description: 'Content to write to the file' }),
      }),
      execute: async (toolCallId, params: any) => {
        try {
          const absPath = params.path.startsWith('/') ? params.path : `${WORKSPACE_DIR}/${params.path}`;
          await cm.writeFile(projectId, absPath, params.content);
          return {
            content: [{ type: 'text', text: `Successfully wrote to ${absPath}` }],
            details: { path: absPath },
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Error writing ${params.path}: ${err.message}` }],
            details: {},
            isError: true,
          };
        }
      },
    };

    // Edit tool — surgical edits to files inside the container
    const editTool: ToolDefinition = {
      name: 'edit',
      label: 'Edit',
      description: `Edit a file inside the container by replacing exact text. The oldText must match exactly (including whitespace). Paths relative to ${WORKSPACE_DIR}.`,
      parameters: Type.Object({
        path: Type.String({ description: 'Path to the file to edit' }),
        oldText: Type.String({ description: 'Exact text to find and replace' }),
        newText: Type.String({ description: 'New text to replace the old text with' }),
      }),
      execute: async (toolCallId, params: any) => {
        try {
          const absPath = params.path.startsWith('/') ? params.path : `${WORKSPACE_DIR}/${params.path}`;

          // Read current content
          const readResult = await cm.exec(projectId, `cat '${absPath.replace(/'/g, "'\\''")}'`);
          if (readResult.exitCode !== 0) {
            return {
              content: [{ type: 'text', text: `Error reading ${absPath}: ${readResult.stderr}` }],
              details: {},
              isError: true,
            };
          }

          const content = readResult.stdout;
          if (!content.includes(params.oldText)) {
            return {
              content: [{ type: 'text', text: `Error: oldText not found in ${absPath}. Make sure it matches exactly.` }],
              details: {},
              isError: true,
            };
          }

          const newContent = content.replace(params.oldText, params.newText);
          await cm.writeFile(projectId, absPath, newContent);

          return {
            content: [{ type: 'text', text: `Successfully edited ${absPath}` }],
            details: { path: absPath },
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Error editing ${params.path}: ${err.message}` }],
            details: {},
            isError: true,
          };
        }
      },
    };

    // ls tool — list directory contents
    const lsTool: ToolDefinition = {
      name: 'ls',
      label: 'List Directory',
      description: `List files and directories inside the container. Paths relative to ${WORKSPACE_DIR}.`,
      parameters: Type.Object({
        path: Type.Optional(Type.String({ description: 'Directory path (default: workspace root)' })),
      }),
      execute: async (toolCallId, params: any) => {
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
          return {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            details: {},
            isError: true,
          };
        }
      },
    };

    // read_terminal tool — reads recent output from the project's terminal sessions
    const readTerminalTool: ToolDefinition = {
      name: 'read_terminal',
      label: 'Read Terminal',
      description: `Read the recent output from the project's terminal sessions. Use this to check dev server logs, build output, error messages, or any other terminal output. Returns the last N lines from all active terminals.`,
      parameters: Type.Object({
        lines: Type.Optional(Type.Number({ description: 'Number of recent lines to read (default: 80)' })),
      }),
      execute: async (toolCallId, params: any) => {
        try {
          const output = cm.readProjectTerminalOutput(projectId, params.lines ?? 80);
          return {
            content: [{ type: 'text', text: output }],
            details: {},
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Error reading terminal: ${err.message}` }],
            details: {},
            isError: true,
          };
        }
      },
    };

    // read_skill tool — reads the full SKILL.md content for an available skill
    const sm = this.skillManager;
    const readSkillTool: ToolDefinition = {
      name: 'read_skill',
      label: 'Read Skill',
      description: `Read the full instructions (SKILL.md) for an available skill. Use this when a task matches a skill's description and you need the detailed instructions.`,
      parameters: Type.Object({
        name: Type.String({ description: 'The skill name to load (e.g., "brave-search")' }),
      }),
      execute: async (toolCallId, params: any) => {
        try {
          const content = sm.readSkillContent(params.name);
          if (!content) {
            return {
              content: [{ type: 'text', text: `Skill "${params.name}" not found or could not be read.` }],
              details: {},
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: content }],
            details: { skillName: params.name },
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Error reading skill: ${err.message}` }],
            details: {},
            isError: true,
          };
        }
      },
    };

    return [bashTool, readTool, writeTool, editTool, lsTool, readTerminalTool, readSkillTool];
  }

  private buildSystemPrompt(projectId: string): string {
    // Inject enabled skills into the system prompt
    const skillsSection = this.skillManager.formatForSystemPrompt(projectId);
    const enabledSkills = this.skillManager.getEnabledSkills(projectId);

    let skillsPrompt = '';
    if (enabledSkills.length > 0) {
      skillsPrompt = `

## Available Skills

You have access to specialized skills that provide detailed instructions for specific tasks.
When a task matches a skill's description, use the \`read_skill\` tool to load its full instructions before proceeding.

${skillsSection}

Use \`read_skill\` with the skill name to load its full SKILL.md instructions when needed.`;
    }

    return `You are Sero, an AI development assistant embedded in a workspace.

You are operating inside a sandboxed Linux container for project "${projectId}".
Your workspace directory is ${WORKSPACE_DIR} — all project files live here.

You have the following tools:
- bash: Execute shell commands in the container
- read: Read file contents
- write: Create or overwrite files
- edit: Make surgical text replacements in files
- ls: List directory contents
- read_terminal: Read recent output from the user's terminal sessions
- read_skill: Load the full instructions for an available skill

Key behaviors:
- Always work within ${WORKSPACE_DIR}
- You have full root access inside the container (Debian-based, node:22-slim)
- The container has network access for installing packages
- Available tools: git, curl, wget, node, npm, ss, netstat, dig, ps, less
- To check listening ports use: ss -tlnp
- Be proactive: if you see a problem, fix it
- When creating projects, set up proper structure (package.json, tsconfig, etc.)
- Run tests and builds to verify your work
- Keep the user informed of what you're doing and why

IMPORTANT — Terminal awareness:
- The user has interactive terminal sessions running inside the container.
- After starting a dev server (via bash or telling the user to run it), ALWAYS use read_terminal to check the output for errors.
- If you see errors in the terminal output (build failures, missing files, crashes), proactively fix them.
- When debugging issues, read_terminal is your first step to see what's happening.

CRITICAL — Dev servers and networking:
- This container runs inside a Linux VM with its own IP address on a private network.
- Dev servers (Vite, Next.js, Express, etc.) MUST bind to 0.0.0.0, not localhost/127.0.0.1.
- For Vite: always use \`--host\` flag, e.g. \`npx vite --host\` or add \`server: { host: '0.0.0.0' }\` to vite.config.
- For Next.js: use \`next dev -H 0.0.0.0\`.
- For Express/Node: use \`.listen(port, '0.0.0.0')\`.
- After starting a dev server, tell the user to check the status bar for the container's URL.${skillsPrompt}`;
  }
}
