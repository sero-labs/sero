<!-- Keep this file general. Do not add PR-specific postmortems, commit IDs, issue links, or one-off bug details. When updating it, extract the reusable review principle and write it so it applies to future PRs. -->

# Code review self-evaluation

A short, growing checklist for improving PR reviews. Add lessons here when a
review misses an issue, proposes a bad fix, or creates avoidable rework.
Keep each lesson general enough to apply to future reviews.

## Core review rules

### Trace changes end to end

For any change that crosses a boundary, follow the full path before approving
or modifying behavior.

Common boundaries:

- component → state store → persistence
- renderer → preload/IPC → main process
- app shell → plugin/runtime/SDK
- UI event → command handler → side effect

Confirm where validation, conversion, persistence, and side effects are owned.
Do not add a second owner for the same responsibility unless the old one is
removed.

### Name the contract before changing it

For data that changes form across layers, state the contract first:

- what the caller sends
- what the receiver expects
- what unit or type is used
- where conversion happens
- whether the value has already been normalized upstream

This applies to coordinates, zoom, scale, time, bytes, file paths, IDs, and
serialized state.

### Separate unknown from invalid

Do not treat temporarily unknown data as invalid. This matters during startup,
hydration, lazy loading, discovery, plugin loading, and async refreshes.

Before pruning or rewriting persisted state, check whether the system has enough
information to prove the value is stale.

### Build an input ownership matrix

For shortcuts, navigation, and shared controls, check every input path against
the same ownership rule.

Review at least:

- keyboard shortcuts
- mouse buttons or gestures
- command menu actions
- toolbar/buttons
- empty states
- embedded or native surfaces
- surrounding shell chrome

If one surface owns an action in a context, related inputs should usually follow
the same rule.

### Review lifecycle states

Check behavior across the full lifecycle, not just the steady state:

- before hydration
- after hydration but before discovery/loading
- loading and pending transitions
- empty states
- stale or removed resources
- unsupported resources
- error recovery
- hot reload or refresh paths

### Re-review fix commits as new diffs

After making review fixes, review the fix commit itself. Ask:

- did the fix duplicate existing behavior?
- did it add a second conversion, validation, or persistence path?
- did it handle startup, empty, stale, and unsupported states?
- did it leave dead code?
- did it duplicate predicates or ownership rules?
- do tests cover both the regression and the edge case?

### Search for duplicated logic after refactors

When adding a helper, state transition, or ownership rule, search for old paths
and inline equivalents. Replace duplicates that can drift.

Useful checks:

- one predicate for the same support/validity rule
- one lookup path for the same navigation target
- one cap/limit check for the same UI constraint
- no dead methods after changing a flow

## General PR checklist

Before finishing a review, verify:

- [ ] Cross-boundary changes were traced end to end.
- [ ] Unit/type ownership is clear for transformed data.
- [ ] Persisted state is not pruned before data loading is complete.
- [ ] Keyboard, mouse, menu, and button inputs follow the same ownership rules.
- [ ] Startup, empty, stale, unsupported, and error states were considered.
- [ ] Fix commits were re-reviewed as fresh diffs.
- [ ] Duplicate predicates and dead code were searched for.
- [ ] Regression tests cover the issue and the edge case that exposed it.
