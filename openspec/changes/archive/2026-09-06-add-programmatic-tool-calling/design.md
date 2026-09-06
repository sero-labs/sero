## Context

Sero creates baseline workspace tools before it creates a Pi session. Plugin extensions add more tools while the session resource loader starts. Main sessions and background subagents both apply active-tool controls, but they assemble their sessions in different modules.

Tool handlers return Pi result envelopes. Generated programs need plain values and must not bypass the argument validation, cancellation, or tool policy that applies to direct calls. See `proposal.md` for the product motivation and scope.

## Goals / Non-Goals

**Goals:**

- Give generated programs standard JavaScript computation and the current session's active tools.
- Keep nested calls at authority parity with direct calls.
- Keep the first version additive and small.
- Use one adapter for validation, execution, result conversion, limits, and tracing.

**Non-Goals:**

- Reducing tool-schema tokens or hiding direct tools from the model.
- Adding approval, continuation, rollback, or automatic retry behavior.
- Loading npm packages or granting direct access to Node.js, files, environment variables, or the network.
- Saving generated programs for later reuse.
- Adding a new progress or approval UI.

## Decisions

### Run generated code in an isolated JavaScript runtime

Use the Vercel `run` package behind one Electron main-process module. Pin the selected package version. The guest receives only a generated `tools` host-function object. Project commands and file operations continue to use the existing workspace runtime through those tools.

This keeps generated computation separate from both Electron and the workspace environment. Running generated code with Node.js or inside the workspace shell was rejected because either option would grant more access than the session tools provide.

### Bind `run_code` to the completed session tool set

Create `run_code` with a late-bound tool provider. After Pi creates the session and loads extensions, bind that provider to the session's current active tools. Resolve the active set when each `run_code` call starts, remove `run_code` itself, and keep that snapshot for the run.

Both main-session and subagent assembly must perform this binding. This is necessary because the baseline runtime-tool factory cannot see tools registered later by plugins. A global tool catalog was rejected because it can be stale and does not represent the calling session's allowlist.

### Reuse existing tool names and schemas

Expose each active tool under its existing name on `tools`. The model already receives the direct tools and their input schemas, so the first version does not generate a second declaration format or rename plugin tools.

This keeps the API direct:

```ts
const file = await tools.read({ path: "package.json" });
const value = JSON.parse(file.text);
return value.name;
```

If Pi prevents duplicate tool names in a session, the same uniqueness rule is sufficient inside `tools`. Tools without a usable input schema are excluded because nested calls cannot validate them safely.

### Put all nested calls through one adapter

The adapter validates arguments against the selected tool's schema before it calls the handler. It supplies a unique nested call identifier, passes the parent abort signal, and converts the returned Pi envelope into plain serializable data.

The initial normalized result has direct text plus optional structured details. Non-text content is represented as bounded serializable data when possible. Unsupported or oversized content produces a clear call error instead of leaking internal objects into the guest.

Calling handlers without this adapter was rejected because it would bypass behavior normally supplied by Pi's tool dispatcher.

### Keep authority and approval behavior unchanged

Code can call only tools active for the session snapshot. Main-session tool overrides, subagent platform-tool policy, disabled tools, and per-step allowlists therefore also restrict code mode.

`run_code` adds no approval layer. A nested tool has the same authority and behavior as a direct call. This avoids creating two permission models for the same tool.

### Use fixed limits and a compact trace

Start with the isolated runtime's conservative limits for execution time, memory, source size, result size, total bridge calls, and concurrent bridge calls. Keep them as host-owned constants rather than model-controlled parameters. Measure normal Sero tasks before changing them.

Record each nested call at the host boundary. Return a bounded summary containing the tool name, status, and duration. Collapse excess entries into counts. Do not copy full nested outputs into the conversation.

Completed side effects remain completed if later code fails. The system reports the failure and trace but does not retry or attempt a cross-tool rollback.

## Risks / Trade-offs

- [The late-bound provider could expose the wrong tool set] -> Snapshot only the calling session's active tools and test main-session overrides and subagent allowlists.
- [Direct handler calls could skip Pi behavior] -> Keep schema validation, identifiers, cancellation, conversion, and tracing in the shared adapter.
- [A loop can call a powerful tool many times] -> Enforce total-call, concurrency, time, and output limits at the host boundary.
- [Fixed runtime limits can stop legitimate long commands] -> Guide the model to use direct calls for simple long-running work and adjust limits only from measured cases.
- [A program can make partial changes before it fails] -> Preserve the trace, return the error, and never retry automatically.
- [Tool output can contain secrets or excessive data] -> Apply existing tool controls, bound normalized output, and keep full nested outputs out of the final trace.

## Migration Plan

1. Add the isolated runtime and `run_code` behind the normal session tool assembly.
2. Enable it for main sessions and background subagents with the same default behavior.
3. Verify authority parity, cancellation, limits, plugin discovery, and failure reporting before release.
4. Remove the tool registration to roll back. Existing sessions and project data need no migration.
