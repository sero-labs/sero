---
name: sero-unit-test
description: Use when adding, editing, or pruning unit tests in Sero. Choose tests that protect consequential behavior and state; remove duplicate, tautological, and incidental copy or DOM checks without losing approved contracts.
---

# Sero unit tests

## Choose the behavior

State the failure the test should catch in one sentence. Find the closest existing tests first. If one already catches that failure, do not add another. Prefer a pure rule test for a pure rule, a component test for a user action, and a boundary test for access, persistence, or integration. Assert an outcome that can disagree with the implementation, not a copy of the fixture or a mocked return value.

Use roles and accessible names to operate controls. Assert the resulting state, saved value, navigation target, disabled action, or visible result. A mock call can be a real contract when it carries a workspace id, model choice, or file path across a component boundary. Do not test incidental call order or a component's private helpers.

## Review a weak-looking test

For a cleanup request, `node scripts/inventory-unit-tests.mjs --candidates` provides **leads only**. It lists tracked `.test.*` files and flags copy, DOM-detail, source-read, snapshot, and mock-call patterns. The initial pilot found many false alarms. Review the named test body; open production code, nearby tests, or the governing spec only when a specific contract or duplication question is unresolved. Do not trace every test through source by default.

Classify each case before editing:

- **DELETE** when stronger tests already catch the failure, or when the assertion only notices an incidental change. Name the surviving proof.
- **KEEP** when it alone protects meaningful behavior, including approved wording, access truth, safety, data loss, state, or accessibility. Name the protected failure.
- **UNSURE** when one missing fact would change the choice. Check that fact or leave the test in place.

Only a cleanup request authorizes deletion. Never remove an entire file before reviewing every test in it. If a weak test contains the only proof of a real behavior, shorten it to the smallest behavioral check rather than dropping the behavior. Do not write a replacement test solely to preserve the test count. For a formal, exhaustive test-by-test audit, use the separate `prune-tests` skill; its deeper evidence requirements are not the default for routine authoring or bounded triage.

## Examples from the cleanup

- **Remove repetition:** `plugins/sero-orchestrator-plugin/ui/__tests__/loop-settings-line.test.tsx` had a test asserting that the steps-at-a-time label was absent, then asserting its own fixture value. The remaining full settings-label test already excludes that label. A second missing-project render case also repeated a lib test and a stronger render case.
- **Keep a contract despite a copy flag:** `plugins/sero-orchestrator-plugin/ui/__tests__/access-tile.test.ts` protects `Read this workspace` and attaches each action to its own target. `openspec/specs/orchestrator-ui/spec.md` approves the access wording; misleading access text is consequential.
- **Trim, do not erase:** `plugins/sero-design-library-plugin/ui/components/GenerateDialog.test.tsx` no longer checks tab classes, textarea rows, or obsolete prose. It still verifies that Restyle and Upscale are unavailable without a source. The desktop runtime-picker tests keep one render check for default and optional badges; the pure matrix tests own the platform combinations.
- **Do not mistake a data read for a source scan:** `apps/agent-node/test/state.test.ts` reads files it just wrote to prove permissions and token protection. `apps/desktop/electron/__tests__/features/profile/roots.test.ts` protects the real profile from test runners. A Dockerfile read in `image-pin.test.ts` guards a cross-artifact RTK version. Keep the safety boundary even if the test reads a file or string.
- **Check apparent duplicates carefully:** `ToolCallGroup.test.tsx` keeps a trailing streaming thinking message beside a tool group. A nearby `group-messages.test.ts` covers a user message beside thinking instead; the input shape differs, so it is not duplicate coverage.

After an authorized edit, remove only unused test helpers and snapshots. Run the focused tests, then the full affected package suite and the root typecheck required by `AGENTS.md` before a source commit. Report failed gates and any remaining uncertainty. Do not claim a runtime improvement from lower test counts alone.
