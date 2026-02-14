/**
 * Type declarations for Module Federation remotes.
 *
 * Each remote declared in vite.config.ts needs a module declaration
 * so TypeScript allows dynamic import('remoteName/exposedModule').
 */

// Remote: sero_todo (pi-todo-extension)
declare module 'sero_todo/TodoApp' {
  const TodoApp: React.ComponentType;
  export default TodoApp;
}
