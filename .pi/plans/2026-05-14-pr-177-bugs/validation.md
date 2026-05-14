# PR #177 P1 Bug Fix Validation

Date: 2026-05-14

## Commands

### 1. Initial attempted targeted test command

```bash
pnpm --filter @sero/desktop test -- \
  apps/desktop/electron/__tests__/features/container/tools-read-images.test.ts \
  apps/desktop/electron/__tests__/features/container/tools-coding-memory-guard.test.ts \
  apps/desktop/electron/__tests__/features/container/tools-coding-file-runtime.test.ts \
  apps/desktop/electron/__tests__/features/workspace/runtime/host-backend.test.ts \
  apps/desktop/electron/__tests__/features/workspace/runtime/posix-substrate.test.ts \
  apps/desktop/electron/__tests__/features/workspace/runtime/run-workspace-command.test.ts \
  apps/desktop/electron/__tests__/features/workspace/runtime/docker-backend.test.ts \
  apps/desktop/electron/__tests__/features/workspace/runtime-resolution.test.ts \
  apps/desktop/electron/__tests__/features/workspace/runtime/apple-container-backend.test.ts \
  apps/desktop/electron/__tests__/ipc/dev-server.test.ts \
  apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.test.tsx
```

Result: **Failed**. The file arguments were not honored by the package script and Vitest ran the full desktop suite. One unrelated full-suite failure remained:

```text
FAIL electron/__tests__/features/apps/app-state-manager.test.ts > AppStateManager watch bootstrap > creates valid JSON placeholder files during watch bootstrap
AssertionError: expected "vi.fn()" to be called with arguments: [ …(3) ]

Received:

1st vi.fn() call:
[
  "/tmp/sero-valid-placeholder-state.json",
- "{}",
+ "null",
  {
    "flag": "wx",
  },
]

Test Files 1 failed | 262 passed (263)
Tests 1 failed | 1230 passed (1231)
Exit status 1
```

The same full-suite failure reproduced when retrying the package script with paths relative to `apps/desktop`.

### 2. Corrected targeted Vitest command

```bash
pnpm --dir apps/desktop exec vitest run \
  electron/__tests__/features/container/tools-read-images.test.ts \
  electron/__tests__/features/container/tools-coding-memory-guard.test.ts \
  electron/__tests__/features/container/tools-coding-file-runtime.test.ts \
  electron/__tests__/features/workspace/runtime/host-backend.test.ts \
  electron/__tests__/features/workspace/runtime/posix-substrate.test.ts \
  electron/__tests__/features/workspace/runtime/run-workspace-command.test.ts \
  electron/__tests__/features/workspace/runtime/docker-backend.test.ts \
  electron/__tests__/features/workspace/runtime-resolution.test.ts \
  electron/__tests__/features/workspace/runtime/apple-container-backend.test.ts \
  electron/__tests__/ipc/dev-server.test.ts \
  src/components/layout/workspace/workspace-tree/RuntimePickerMenu.test.tsx
```

Result: **Passed**.

```text
Test Files 11 passed (11)
Tests 70 passed (70)
Duration 1.29s
```

This covers all seven P1 findings:

- runtime file-backed coding/image reads and edits
- host symlink containment
- isolated command propagation, including Docker and Apple Container backends
- runtime-resolution health behavior
- dev-server stop/restart legacy fallback
- Apple Container `execFile` env key validation
- runtime picker trigger propagation

### 3. Typecheck

```bash
pnpm typecheck
```

Result: **Passed**.

```text
Tasks: 15 successful, 15 total
Cached: 15 cached, 15 total
Time: 54ms >>> FULL TURBO
```

### 4. Source file line counts

```bash
wc -l \
  apps/desktop/electron/features/container/tools/tools-coding.ts \
  apps/desktop/electron/features/workspace/runtime/backends/host/host-substrate.ts \
  apps/desktop/electron/features/workspace/runtime/backends/host/posix-substrate.ts \
  apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts \
  apps/desktop/electron/features/workspace/runtime/types.ts \
  apps/desktop/electron/features/workspace/runtime/run-workspace-command.ts \
  apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts \
  apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts \
  apps/desktop/electron/features/workspace/runtime-resolution.ts \
  apps/desktop/electron/ipc/container/dev-server.ts \
  apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.tsx
```

Result: **Passed**. No touched source file exceeds 500 LOC.

```text
429 apps/desktop/electron/features/container/tools/tools-coding.ts
72 apps/desktop/electron/features/workspace/runtime/backends/host/host-substrate.ts
193 apps/desktop/electron/features/workspace/runtime/backends/host/posix-substrate.ts
434 apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts
223 apps/desktop/electron/features/workspace/runtime/types.ts
49 apps/desktop/electron/features/workspace/runtime/run-workspace-command.ts
437 apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts
474 apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts
190 apps/desktop/electron/features/workspace/runtime-resolution.ts
152 apps/desktop/electron/ipc/container/dev-server.ts
155 apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.tsx
2808 total
```

## Summary

Targeted P1 validation and repository typecheck passed. The only observed failure was from an accidental full-suite run caused by the package test script not honoring file arguments as expected; the failing test (`app-state-manager.test.ts`) is outside the PR #177 P1 target set.
