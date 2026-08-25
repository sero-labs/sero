# Repository reference

Read only the section that applies to the current task. `AGENTS.md` contains the
rules that apply to all work.

## Product copy

At key product entry points, use the position: **Grow your own Agent.** Sero
gives an AI agent a workspace, memory, skills, and plugins so it becomes fitted
to how each person works. Do not add this message to every page or imply that
Sero retrains the model.

Keep product and documentation text short and direct. Do not add labels or
descriptions when a UI control is clear without them.

## TypeScript and implementation

- Import canonical Pi SDK types instead of copying them.
- Trust TypeScript guarantees. Do not add runtime checks for states excluded by
  the type system.
- Use top-level imports. Do not use inline `import('...')` type expressions.
- Do not add one-line wrappers or casting helpers.
- Do not use `try` and `catch` for file checks or normal control flow.
- Use `useDebouncedCallback` or `createDebouncedFn` from
  `src/hooks/useDebouncedCallback.ts` instead of a custom timeout debounce.
- Add a concise comment only when the purpose is not clear from the code.
- Do not implement a heuristic for work that belongs in the AI or LLM layer
  unless the task is explanatory or the user asks for a heuristic.

## Tests

Test observable behavior with deterministic tests. Use a live model only when a
deterministic test cannot prove the required property. State that property in
one sentence in the commit or pull request body before you add a live-model
test.

Name each test for the behavior it protects. Add a comment only when the test
name does not make the behavior clear. Prefer focused functional tests over
repeated smoke tests for removed behavior.

## UI and prototypes

- Use Tailwind size utilities such as `text-sm` and `text-base`. Do not use
  arbitrary font sizes.
- Store UX prototypes in `apps/styleguide/public/prototypes/` and link them from
  `apps/styleguide/src/PrototypeArchive.tsx`.

## Packages and documentation

- If a change affects `packages/*`, remind the user that the package might need
  publication to npm.
- Before you create a pull request, check whether `apps/docs-site` needs an
  update.
- Do not lint or validate Markdown when no rendered output, links, or examples
  can be affected.
