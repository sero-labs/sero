## 1. Isolated program runtime

- [ ] 1.1 Add and pin the Vercel `run` dependency in the desktop package, then verify installation and Electron main-process bundling succeed.
- [ ] 1.2 Add a focused program-runner module with host-owned runtime limits, then verify unit tests cover JavaScript, type-stripped TypeScript, standard data processing, unavailable host APIs, returned values, and limit failures.

## 2. Nested tool adapter

- [ ] 2.1 Implement active-tool snapshots that exclude `run_code`, then verify tests reject missing, disabled, and recursive tool names.
- [ ] 2.2 Validate nested arguments against each tool schema before execution, then verify an invalid call does not invoke its handler.
- [ ] 2.3 Execute valid nested calls with unique identifiers and parent cancellation, then verify concurrent calls and cancellation with focused tests.
- [ ] 2.4 Normalize text and structured tool results into bounded plain data, then verify generated code can parse a file result without reading Pi's internal envelope.
- [ ] 2.5 Record a bounded call summary with tool name, status, and duration, then verify large call sequences collapse without adding full nested outputs.

## 3. `run_code` tool

- [ ] 3.1 Add the `run_code({ code })` tool with a late-bound active-tool provider and concise usage guidance, then verify one program can read JSON, parse it, and return a transformed value.
- [ ] 3.2 Map program completion and failure into one Pi tool result, then verify nested failures, runtime failures, and successful final values are clear to the model.

## 4. Session integration

- [ ] 4.1 Bind `run_code` to the completed main-session tool set after extensions load, then verify active baseline and plugin tools are callable while disabled tools remain unavailable.
- [ ] 4.2 Bind `run_code` in background subagent sessions, then verify platform-tool policy, disabled tools, and per-step allowlists also restrict nested calls.
- [ ] 4.3 Verify authority parity with a mutating test tool: direct and nested calls use the same handler behavior and code mode adds no approval or permission path.

## 5. Integration checks

- [ ] 5.1 Add an integration test where one program calls at least two existing tools, uses standard JavaScript to combine their results, and returns one compact value and call summary.
- [ ] 5.2 Run the closest desktop test suites and `pnpm typecheck` from the monorepo root, then confirm all checks pass and every changed source file remains at or below 500 lines.
