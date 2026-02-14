/**
 * TodoApp — Sero web UI for the todo extension.
 *
 * Uses useAppState from @sero/app-runtime to read/write the same
 * state.json file the Pi extension writes. Changes from either
 * direction are reflected instantly via file watching.
 */

import { useState, useCallback } from 'react';
import { useAppState } from '@sero/app-runtime';
import type { TodoState, Todo } from '../shared/types';
import { DEFAULT_TODO_STATE } from '../shared/types';

// ── TodoApp ──────────────────────────────────────────────────

export function TodoApp() {
  const [state, updateState] = useAppState<TodoState>(DEFAULT_TODO_STATE);
  const [newText, setNewText] = useState('');

  const addTodo = useCallback(() => {
    const text = newText.trim();
    if (!text) return;

    updateState((prev) => ({
      ...prev,
      todos: [
        ...prev.todos,
        {
          id: prev.nextId,
          text,
          done: false,
          createdAt: new Date().toISOString(),
        },
      ],
      nextId: prev.nextId + 1,
    }));
    setNewText('');
  }, [newText, updateState]);

  const toggleTodo = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        todos: prev.todos.map((t) =>
          t.id === id ? { ...t, done: !t.done } : t,
        ),
      }));
    },
    [updateState],
  );

  const removeTodo = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        todos: prev.todos.filter((t) => t.id !== id),
      }));
    },
    [updateState],
  );

  const clearCompleted = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      todos: prev.todos.filter((t) => !t.done),
    }));
  }, [updateState]);

  const completedCount = state.todos.filter((t) => t.done).length;
  const totalCount = state.todos.length;

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          DANS Todos
        </h1>
        {totalCount > 0 && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {completedCount}/{totalCount} completed
          </p>
        )}
      </div>

      {/* Add form */}
      <div className="border-b border-border/50 px-6 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTodo();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add a todo…"
            className="flex-1 rounded-md border border-border/50 bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto">
        {totalCount === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-border/30">
            {state.todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={toggleTodo}
                onRemove={removeTodo}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {completedCount > 0 && (
        <div className="border-t border-border/50 px-6 py-2">
          <button
            onClick={clearCompleted}
            className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
          >
            Clear {completedCount} completed
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function TodoItem({
  todo,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-6 py-2.5 hover:bg-[var(--bg-surface)]">
      <button
        onClick={() => onToggle(todo.id)}
        className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
          todo.done
            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
            : 'border-border/80 hover:border-[var(--accent)]'
        }`}
      >
        {todo.done && (
          <svg
            className="size-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={3}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        )}
      </button>

      <span
        className={`flex-1 text-sm ${
          todo.done
            ? 'text-[var(--text-muted)] line-through'
            : 'text-[var(--text-primary)]'
        }`}
      >
        {todo.text}
      </span>

      <button
        onClick={() => onRemove(todo.id)}
        className="text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        aria-label="Remove"
      >
        <svg
          className="size-3.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-3xl">✅</span>
      <p className="mt-3 text-sm text-[var(--text-muted)]">No todos yet</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Add one above or ask the agent
      </p>
    </div>
  );
}

export default TodoApp;
