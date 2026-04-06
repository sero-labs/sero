import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Type } from '@sinclair/typebox';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

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

interface EvalCliResult {
  output: string;
  exitCode: number;
}

export function createEvalPromptExtensionFactory() {
  return (pi: ExtensionAPI) => {
    pi.on('before_agent_start', async (event) => {
      if (event.systemPrompt.includes('## Sero CLI')) {
        return { systemPrompt: event.systemPrompt };
      }
      return {
        systemPrompt: `${event.systemPrompt}${EVAL_CLI_PROMPT_BLOCK}`,
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

export async function seedEvalWorkspace(tmpDir: string): Promise<void> {
  await writeFile(
    `${tmpDir}/.sero-workspace.json`,
    `${JSON.stringify(
      {
        id: `eval-${randomUUID().slice(0, 8)}`,
        name: 'Eval Workspace',
        container: false,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await execFileAsync('git', ['init', '-q'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.email', 'eval@sero.local'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.name', 'Sero Eval'], { cwd: tmpDir });
  await execFileAsync('git', ['add', '.sero-workspace.json'], { cwd: tmpDir });
  await execFileAsync('git', ['commit', '-qm', 'chore: initialise eval workspace'], {
    cwd: tmpDir,
  });
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
): Promise<EvalCliResult> {
  const tokens = tokenizeCliInput(line);
  if (tokens[0] === 'sero') tokens.shift();
  if (tokens.length === 0) {
    return { exitCode: 1, output: 'ERROR: No command provided' };
  }

  const [root, action = ''] = tokens;

  if (root === 'help') {
    return { exitCode: 0, output: buildHelpText(tokens[1]) };
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

  return {
    exitCode: 1,
    output: `ERROR: Unknown command: ${tokens.join(' ')}`,
  };
}

export function createEvalSeroCliTool(tmpDir: string) {
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
        const result = await runEvalCliLine(line, state, tmpDir);
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
