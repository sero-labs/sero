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

// Remote: sero_weight_tracker (pi-weight-tracker)
declare module 'sero_weight_tracker/WeightTracker' {
  const WeightTracker: React.ComponentType;
  export default WeightTracker;
}

// Remote: sero_daily_quote (pi-daily-quote)
declare module 'sero_daily_quote/DailyQuote' {
  const DailyQuote: React.ComponentType;
  export default DailyQuote;
}
