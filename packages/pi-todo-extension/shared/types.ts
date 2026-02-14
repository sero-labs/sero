/**
 * Shared state shape for the Todo app.
 *
 * This is the single source of truth — both the Pi extension and the
 * Sero web UI read/write a JSON file matching this shape.
 */

export interface Todo {
  id: number;
  text: string;
  done: boolean;
  createdAt: string; // ISO string
}

export interface TodoState {
  todos: Todo[];
  nextId: number;
}

export const DEFAULT_TODO_STATE: TodoState = {
  todos: [],
  nextId: 1,
};
