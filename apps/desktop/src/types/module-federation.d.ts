/**
 * Module Federation type declarations.
 *
 * Previously this file declared a module per federated remote so TypeScript
 * would accept static `import('sero_todo/TodoApp')` calls. Now that the
 * federation registry uses `loadRemote()` (a string-based runtime API),
 * no per-remote declarations are needed. This file is kept empty as a
 * placeholder in case future static imports require declarations.
 */
