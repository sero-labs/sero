/**
 * sero todo — manage workspace todos.
 *
 * State: workspace-scoped (relative to cwd).
 */

import type { CommandDef, Flags } from '../main.js';
import { resolveWorkspaceStatePath, readState, writeState } from '../state.js';

interface Todo {
  id: number;
  text: string;
  done: boolean;
  createdAt: string;
}

interface TodoState {
  todos: Todo[];
  nextId: number;
}

const DEFAULT: TodoState = { todos: [], nextId: 1 };

function statePath(): string {
  return resolveWorkspaceStatePath('todo');
}

async function run(args: string[], flags: Flags): Promise<void> {
  const action = args[0];
  if (!action) throw new Error('No action specified. Run \'sero help todo\' for usage.');

  const fp = statePath();
  const state = await readState<TodoState>(fp, DEFAULT);

  switch (action) {
    case 'list': {
      if (state.todos.length === 0) {
        process.stdout.write('No todos yet.\n');
        return;
      }

      if (flags.json) {
        process.stdout.write(JSON.stringify({ todos: state.todos, count: state.todos.length }, null, 2) + '\n');
        return;
      }

      const lines = state.todos.map(
        (t) => `[${t.done ? 'x' : ' '}] #${t.id}: ${t.text}`,
      );
      process.stdout.write(lines.join('\n') + '\n');
      return;
    }

    case 'add': {
      // Everything after 'add' is the text
      const text = args.slice(1).join(' ').trim();
      if (!text) throw new Error('Text is required. Usage: sero todo add "your task"');
      const todo: Todo = {
        id: state.nextId,
        text,
        done: false,
        createdAt: new Date().toISOString(),
      };
      state.todos.push(todo);
      state.nextId++;
      await writeState(fp, state);

      if (flags.json) {
        process.stdout.write(JSON.stringify(todo, null, 2) + '\n');
      } else {
        process.stdout.write(`Added todo #${todo.id}: ${todo.text}\n`);
      }
      return;
    }

    case 'toggle': {
      const id = Number(args[1]);
      if (!id || isNaN(id)) throw new Error('Todo ID is required. Usage: sero todo toggle <id>');
      const todo = state.todos.find((t) => t.id === id);
      if (!todo) throw new Error(`Todo ${id} not found.`);
      todo.done = !todo.done;
      await writeState(fp, state);
      process.stdout.write(`Todo #${todo.id} ${todo.done ? 'completed' : 'uncompleted'}\n`);
      return;
    }

    case 'clear': {
      const count = state.todos.length;
      await writeState(fp, { ...DEFAULT });
      process.stdout.write(`Cleared ${count} todos\n`);
      return;
    }

    default:
      throw new Error(`Unknown action "${action}". Run 'sero help todo' for usage.`);
  }
}

export const todoCommand: CommandDef = {
  description: 'Manage todo list (add, toggle, list, clear)',
  helpText: `Manage workspace todo list — add, toggle, list, and clear tasks.

USAGE
  sero todo <action> [args]

ACTIONS
  list                List all todos
  add <text>          Add a new todo
  toggle <id>         Toggle todo completion
  clear               Remove all todos

FLAGS
  --json              Output as JSON

EXAMPLES
  sero todo list
  sero todo add "Fix login bug"
  sero todo add "Write tests" && sero todo add "Deploy to staging"
  sero todo toggle 1
  sero todo clear`,
  run,
};
