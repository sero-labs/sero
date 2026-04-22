# Required Gate Revalidation Report

Date: 2026-04-22
Branch: `feat/release-prep`

## Scope

Revalidate the current required local gate after fixing the desktop memory-plugin session loading regressions that were breaking `apps/desktop/e2e/memory-snapshot.spec.ts`.

This report records **local** gate status only. It does **not** claim that a remote GitHub Actions run has already completed green.

## Changes validated

- Preserve built-in plugin package entries in `agent/settings.json` during startup reconciliation
- Treat Electron runtime versions like `33.4.11+wvcus` as invalid host-app versions for plugin compatibility checks, falling back to Sero's app version instead
- Prefer bridged extension tools over same-name slash commands so `sero memory ...` resolves to the memory tool rather than the lightweight `/memory` command shim

## Commands run

From repo root:

```bash
pnpm typecheck
pnpm test:ci
```

Focused validation during the fix wave:

```bash
cd apps/desktop
pnpm exec vitest run \
  electron/__tests__/features/plugins/plugin-compatibility.test.ts \
  electron/__tests__/features/plugins/plugin-manager.test.ts \
  electron/__tests__/cli/extension-session-bridge.test.ts \
  electron/__tests__/agent/direct-cli-prompt.test.ts
CI=1 pnpm exec playwright test e2e/memory-snapshot.spec.ts --project=ci
```

## Result

- `pnpm typecheck` ✅
- `pnpm test:ci` ✅
- Focused `memory-snapshot` Playwright spec ✅

Observed final `test:e2e` summary inside `pnpm test:ci`:

- `42 passed`
- `1 skipped`

## Notes

- This closes the previously reproduced local regression where `sero memory config ...` / `sero memory write ...` returned `Unknown command` or resolved to the slash-command shim instead of the memory tool.
- `before_agent_start` memory context injection is now active again in the e2e runtime because the memory plugin extension loads into live chat sessions.
- The checklist item `CI is green on required gates` should remain unchecked until an actual remote required CI run is observed green.
