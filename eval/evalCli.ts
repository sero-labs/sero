import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Type } from '@sinclair/typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const execFileAsync = promisify(execFile);

const EVAL_CLI_PROMPT_BLOCK = `

## Sero CLI

Use \`sero-cli\` for Sero platform actions instead of doing them manually.

Supported commands:
- \`todo add <text>\`
- \`todo list\`
- \`notes add <title> --body <text>\`
- \`current_time\`
- \`workspace info\`
- \`vcs status\`

Aliases also supported:
- \`note add ...\`
- \`current-time\`
- \`git status\` (maps to \`vcs status\`)

You can batch multiple commands in ONE \`sero-cli\` call by putting one command per line.
Prefer a single batched \`sero-cli\` call when the user asks for multiple Sero actions.

## Eval response rules
- If you create or edit a file, include the final file contents inline in a fenced code block after doing the tool work.
- If you use \`sero-cli\`, explicitly say that you used \`sero-cli\` and summarise what it returned.
- Be concise, but include enough concrete detail for an evaluator to verify the result.
`;

interface EvalCliTodo {
  id: number;
  text: string;
  completed: boolean;
}

interface EvalCliNote {
  id: number;
  title: string;
  body: string;
}

interface EvalCliState {
  todos: EvalCliTodo[];
  notes: EvalCliNote[];
  nextTodoId: number;
  nextNoteId: number;
}

export interface EvalCliResult {
  output: string;
  exitCode: number;
}

interface EvalPromptOptions {
  graphify?: boolean;
}

interface EvalCliOptions {
  extraHelp?: string;
  runExtensionCommand?: (tokens: string[]) => Promise<EvalCliResult | null>;
}

export function createEvalPromptExtensionFactory(options: EvalPromptOptions = {}) {
  return (pi: ExtensionAPI) => {
    pi.on('before_agent_start', async (event) => {
      if (event.systemPrompt.includes('## Sero CLI')) {
        return { systemPrompt: event.systemPrompt };
      }
      const graphifyPrompt = options.graphify
        ? `\nGraphify commands are available through the \`sero-cli\` model tool. `
          + 'Call that tool with a `command` value. Do not run a `sero-cli` executable in Bash.\n'
          + '- `graphify_query --question "<question>"` for current-workspace relationships\n'
          + '- `graphify_search --question "<question>"` for profile-wide and cross-workspace search\n'
          + '- `graphify_path --from "<concept>" --to "<concept>"` for the shortest relationship\n'
          + '- `graphify_explain --concept "<concept>"` for one concept\n'
        : '';
      return {
        systemPrompt: `${event.systemPrompt}${EVAL_CLI_PROMPT_BLOCK}${graphifyPrompt}`,
      };
    });
  };
}

export function stripExtensionTools(base: any): any {
  for (const extension of base.extensions ?? []) {
    if (extension.tools instanceof Map) {
      extension.tools.clear();
    }
    if (extension.commands instanceof Map) {
      extension.commands.clear();
    }
  }
  return base;
}

export async function seedEvalWorkspace(
  tmpDir: string,
  options: { includeSearchFixtures?: boolean } = {},
): Promise<{ id: string; name: string; path: string }> {
  const workspaceId = `eval-${randomUUID().slice(0, 8)}`;
  const workspaceName = 'Eval Workspace';
  await writeFile(
    `${tmpDir}/.sero-workspace.json`,
    `${JSON.stringify(
      {
        id: workspaceId,
        name: workspaceName,
        container: false,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const fixtures = options.includeSearchFixtures ? [
    ['src/session/find-session.ts', "export function locateSessionArchive(id: string): string {\n  return `sessions/${id}.jsonl`;\n}\n"],
    ['src/search/workspace-labels.ts', "export const SERO_WORKSPACE_LABEL = 'ai.sero.workspaceId';\n"],
    ['config/release-manifest.json', '{\n  "artifactGlobs": ["dist/**", "plugins/**"]\n}\n'],
    ['src/audit/first.ts', "export const firstAudit = 'SEARCH_AUDIT_MARKER';\n"],
    ['src/audit/second.ts', "export const secondAudit = 'SEARCH_AUDIT_MARKER';\n"],
    [
      'src/workspace/create-workspace.ts',
      "import { persistWorkspaceRecord } from './registry';\n\n"
        + 'export async function createWorkspace(spec: WorkspaceSpec): Promise<void> {\n'
        + '  validateWorkspaceSpec(spec);\n'
        + '  await persistWorkspaceRecord(spec);\n'
        + '}\n',
    ],
    [
      'src/workspace/registry.ts',
      "import { startWorkspaceContainer } from '../container/start-container';\n\n"
        + 'export async function persistWorkspaceRecord(spec: WorkspaceSpec): Promise<void> {\n'
        + '  await saveWorkspace(spec);\n'
        + '  await startWorkspaceContainer(spec.id);\n'
        + '}\n',
    ],
    [
      'src/container/start-container.ts',
      'export async function startWorkspaceContainer(workspaceId: string): Promise<void> {\n'
        + '  await containerRuntime.start(workspaceId);\n'
        + '}\n',
    ],
    [
      'src/checkout/client.ts',
      "export const CheckoutClient = { transport: '@sero/billing-client' };\n",
    ],
  ] as const : [];
  for (const [relativePath, contents] of fixtures) {
    const absolutePath = `${tmpDir}/${relativePath}`;
    await mkdir(absolutePath.slice(0, absolutePath.lastIndexOf('/')), { recursive: true });
    await writeFile(absolutePath, contents, 'utf8');
  }

  await execFileAsync('git', ['init', '-q'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.email', 'eval@sero.local'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.name', 'Sero Eval'], { cwd: tmpDir });
  await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
  await execFileAsync('git', ['commit', '-qm', 'chore: initialise eval workspace'], {
    cwd: tmpDir,
  });

  return { id: workspaceId, name: workspaceName, path: tmpDir };
}

function tokenizeCliInput(input: string): string[] {
  const matches = input.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) ?? [];
  return matches.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"'))
      || (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });
}

function pullFlag(tokens: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = tokens.indexOf(name);
    if (index === -1) continue;
    const value = tokens[index + 1];
    tokens.splice(index, value ? 2 : 1);
    return value;
  }
  return undefined;
}

function formatTodoList(todos: EvalCliTodo[]): string {
  if (todos.length === 0) return 'No todos.';
  return todos
    .map((todo) => `#${todo.id} [${todo.completed ? 'x' : ' '}] ${todo.text}`)
    .join('\n');
}

function buildHelpText(command?: string): string {
  switch (command) {
    case 'todo':
      return 'todo — Usage: todo add <text> | todo list';
    case 'notes':
    case 'note':
      return 'notes — Usage: notes add <title> --body <text>';
    case 'workspace':
      return 'workspace — Usage: workspace info';
    case 'current_time':
    case 'current-time':
      return 'current_time — Usage: current_time';
    case 'vcs':
    case 'git':
      return 'vcs — Usage: vcs status';
    default:
      return [
        'Available commands:',
        '  todo add <text>',
        '  todo list',
        '  notes add <title> --body <text>',
        '  current_time',
        '  workspace info',
        '  vcs status',
      ].join('\n');
  }
}

async function runVcsStatus(tmpDir: string): Promise<EvalCliResult> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: tmpDir,
    });
    const status = stdout.trim();
    if (!status) {
      return {
        exitCode: 0,
        output: 'Working copy clean. No uncommitted changes.',
      };
    }
    return {
      exitCode: 0,
      output: `Uncommitted changes:\n${status}`,
    };
  } catch (error: any) {
    const message = String(error?.stderr ?? error?.message ?? 'Failed to get git status').trim();
    return {
      exitCode: 1,
      output: `ERROR: ${message}`,
    };
  }
}

async function runEvalCliLine(
  line: string,
  state: EvalCliState,
  tmpDir: string,
  options: EvalCliOptions,
): Promise<EvalCliResult> {
  const tokens = tokenizeCliInput(line);
  if (tokens[0] === 'sero') tokens.shift();
  if (tokens.length === 0) {
    return { exitCode: 1, output: 'ERROR: No command provided' };
  }

  const [root, action = ''] = tokens;

  if (root === 'help') {
    const baseHelp = buildHelpText(tokens[1]);
    return {
      exitCode: 0,
      output: options.extraHelp && !tokens[1]
        ? `${baseHelp}\n${options.extraHelp}`
        : baseHelp,
    };
  }
  if (root === 'current_time' || root === 'current-time') {
    const now = new Date();
    return {
      exitCode: 0,
      output: `Current time: ${now.toLocaleString()} (${now.toISOString()})`,
    };
  }
  if (root === 'workspace') {
    if (!action || action === 'info') {
      return {
        exitCode: 0,
        output: [
          'Workspace: Eval Workspace',
          `Path: ${tmpDir}`,
          'Runtime: host filesystem',
          'Containerized: no',
        ].join('\n'),
      };
    }
    return { exitCode: 1, output: 'ERROR: Usage: workspace info' };
  }
  if (root === 'todo') {
    if (action === 'add') {
      const text = tokens.slice(2).join(' ').trim();
      if (!text) return { exitCode: 1, output: 'ERROR: Usage: todo add <text>' };
      const todo: EvalCliTodo = {
        id: state.nextTodoId++,
        text,
        completed: false,
      };
      state.todos.push(todo);
      return {
        exitCode: 0,
        output: `Added todo #${todo.id}: ${todo.text}`,
      };
    }
    if (action === 'list') {
      return {
        exitCode: 0,
        output: formatTodoList(state.todos),
      };
    }
    return { exitCode: 1, output: 'ERROR: Usage: todo add <text> | todo list' };
  }
  if (root === 'notes' || root === 'note') {
    if (action !== 'add') {
      return { exitCode: 1, output: 'ERROR: Usage: notes add <title> --body <text>' };
    }
    const args = tokens.slice(2);
    const body = pullFlag(args, '--body', '-b') ?? args.slice(1).join(' ').trim();
    const title = pullFlag(args, '--title') ?? args[0]?.trim();
    if (!title || !body) {
      return { exitCode: 1, output: 'ERROR: Usage: notes add <title> --body <text>' };
    }
    const note: EvalCliNote = {
      id: state.nextNoteId++,
      title,
      body,
    };
    state.notes.push(note);
    return {
      exitCode: 0,
      output: `Added note #${note.id}: ${note.title}\n${note.body}`,
    };
  }
  if (root === 'vcs' || root === 'git') {
    if (!action || action === 'status') {
      return runVcsStatus(tmpDir);
    }
    return { exitCode: 1, output: 'ERROR: Usage: vcs status' };
  }

  const extensionResult = await options.runExtensionCommand?.(tokens);
  if (extensionResult) return extensionResult;

  return {
    exitCode: 1,
    output: `ERROR: Unknown command: ${tokens.join(' ')}`,
  };
}

export function createEvalSeroCliTool(tmpDir: string, options: EvalCliOptions = {}) {
  const state: EvalCliState = {
    todos: [],
    notes: [],
    nextTodoId: 1,
    nextNoteId: 1,
  };

  return {
    name: 'sero-cli',
    label: 'Sero CLI',
    description:
      'Execute Sero platform commands. Supports multi-line input to chain commands (one per line).',
    parameters: Type.Object({
      command: Type.String({ description: 'CLI command text to execute' }),
      timeout: Type.Optional(Type.Number({ description: 'Optional timeout in seconds' })),
    }),
    execute: async (_toolCallId: string, params: { command: string }) => {
      const lines = params.command
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return {
          content: [{ type: 'text', text: 'ERROR: No command provided' }],
          details: { exitCode: 1 },
        };
      }

      const sections: string[] = [];
      let finalExitCode = 0;

      for (const line of lines) {
        const result = await runEvalCliLine(line, state, tmpDir, options);
        finalExitCode = result.exitCode;
        sections.push(lines.length === 1 ? result.output : `$ ${line}\n${result.output}`);
        if (result.exitCode !== 0) break;
      }

      return {
        content: [{ type: 'text', text: sections.join('\n\n') }],
        details: { exitCode: finalExitCode },
      };
    },
  };
}
