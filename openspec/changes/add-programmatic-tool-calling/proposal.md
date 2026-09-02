## Why

Sero agents must use one model tool call at a time, which makes work that needs loops, conditions, parallel calls, or processing across several tool results hard to express. Programmatic tool calling lets the model write a bounded TypeScript program that combines the tools already available to its session.

## What Changes

- Add a `run_code({ code })` tool that executes JavaScript or type-stripped TypeScript in an isolated runtime.
- Expose the current session's available Sero tools to the program as functions under `tools`.
- Preserve authority parity: code can use only the tools and permissions already available to the calling session.
- Let programs use standard JavaScript computation, including parsing, regular expressions, loops, conditions, helper functions, and asynchronous work.
- Return the program's final value and a short nested-call trace as one tool result.
- Apply fixed execution, concurrency, call-count, and output limits.
- Normalize tool results into values that generated code can use without knowing Pi's internal result envelope.

## Capabilities

### New Capabilities

- `programmatic-tool-calling`: Bounded JavaScript and TypeScript programs can compose the tools available to the current agent session.

### Modified Capabilities

None.

## Impact

- Affects Electron main-process tool and agent-session assembly for main sessions and background subagents.
- Adds a pinned dependency for the isolated code runtime.
- Requires adapters for tool discovery, argument validation, result normalization, cancellation, limits, and nested-call traces.
- Does not add permissions, approval flows, package imports, direct filesystem access, direct environment access, or direct network access.
