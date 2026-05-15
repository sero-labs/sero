# PR #177 Castlabs Electron upgrade evaluation

| Item | Value |
| --- | --- |
| Current version | `github:castlabs/electron-releases#v33.4.11+wvcus` |
| Tested version | `github:castlabs/electron-releases#v42.0.0+wvcus` |
| Tested Electron runtime | `v42.0.0` |
| Branch/worktree | `/Users/danielcarter/Documents/Dev/projects/sero/sero-electron-spike-pr-177` (`spike/electron-castlabs-upgrade-pr-177`) |
| Isolation | Dependency and lockfile changes stayed in the isolated worktree. This file was copied/written into the main worktree for downstream todos. |

## Tag selection

`v42.0.0+wvcus` was the requested target and is available in Castlabs releases:

```bash
git ls-remote --tags https://github.com/castlabs/electron-releases.git 'refs/tags/v42*'
# f785b9dc477b1227e473c79a1c12fb9701c6eb1b refs/tags/v42.0.0+wvcus
# b00d33ed9c536c772473590728135b1f199ec314 refs/tags/v42.0.0-alpha.6+wvcus
```

A broader tag check showed `v43.0.0-alpha.1+wvcus`, but no newer stable Castlabs `+wvcus` tag in the sampled output. I therefore tested the requested stable `v42.0.0+wvcus` tag rather than an alpha.

## Install/update commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --filter @sero/desktop add -D electron@github:castlabs/electron-releases#v42.0.0+wvcus` | Pass | Completed in 21.1s using pnpm v10.11.0. Root postinstall rebuilt `node-pty` for host Node; `better-sqlite3` Electron check skipped because Electron binary was not present yet. Peer/deprecation warnings only. |
| `pnpm install --force --config.optional=true` | Pass | Completed in 49.5s using pnpm v10.11.0. Downloaded optional packages and completed root postinstall. Warning: ignored build scripts for several packages pending `pnpm approve-builds`; no install failure. |

## Compile gate

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --filter @sero/desktop typecheck` | Pass | `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit` completed with no TypeScript errors. |
| `pnpm --dir apps/desktop build:electron` | Pass | Electron main/preload esbuild completed. Only warning was existing Node `MODULE_TYPELESS_PACKAGE_JSON` warning for `builtin-package-detection.js`. |
| `pnpm --dir apps/desktop exec electron --version` | Pass | Downloaded Electron binary and printed `v42.0.0`. |

## Spike-only files changed

In the isolated worktree only:

```text
M apps/desktop/package.json
M pnpm-lock.yaml
```

No source code changes, no `any`, no `@ts-ignore`, and no `@ts-expect-error` were introduced. `apps/desktop/electron-builder.yml` remains unchanged and continues to use `electronDist: node_modules/electron/dist`.

## Compile-spike conclusion

The Castlabs Electron `v42.0.0+wvcus` dependency installs and passes the requested compile gate in isolation. Further native module, preload/IPC, packaging, and smoke validation remains for TODO PR-177-HARDENING-07 before proposing or deferring a merge.

## Native module, preload/IPC, packaging, and smoke validation

Validation was run only in the isolated worktree `/Users/danielcarter/Documents/Dev/projects/sero/sero-electron-spike-pr-177` on branch `spike/electron-castlabs-upgrade-pr-177`.

### Native rebuild and module probes

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm rebuild` | Fail | Root postinstall reported `node-pty` works with host Node v22.22.0 / ABI 127, then failed rebuilding `better-sqlite3` for Electron 42.0.0. `@electron/rebuild` failed with `Could not detect abi for version 42.0.0 and runtime electron. Updating "node-abi" might help solve this issue if it is a new release of electron`. |
| `pnpm rebuild electron` | Not reached meaningfully | The scripted sequence continued after the first failure, but there was no useful native validation output for Electron itself. |
| `pnpm rebuild node-pty better-sqlite3` | Not sufficient | No successful Electron ABI rebuild was produced for `better-sqlite3`. |
| `pnpm exec node` probe for `node-pty` in `apps/desktop` | Pass | Spawned `/bin/sh -lc 'printf pty-ok'`; exit `0`, output included `pty-ok`. This validates the host Node binary, not Electron ABI. |
| Direct `better-sqlite3@11.10.0` Node probe | Fail | `Could not locate the bindings file` under `node_modules/.pnpm/better-sqlite3@11.10.0/...`; no usable rebuilt binding was present after the failed rebuild. |

Native module conclusion: `node-pty` host-Node loading/spawn works, but the Electron 42 native rebuild gate fails for `better-sqlite3`. Because packaging/release flow depends on manual native rebuilds, this is a blocker.

### Automated tests and typecheck

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --filter @sero/desktop exec vitest run electron/__tests__/ipc/preload-api-subscriptions.test.ts electron/__tests__/ipc/runtime-boundaries.test.ts electron/__tests__/features/workspace/runtime electron/__tests__/features/container` | Fail | Preload/IPC contract tests passed (`preload-api-subscriptions`: 7 tests; `runtime-boundaries`: 4 tests). Runtime/container suite had 1 failure: `electron/__tests__/features/workspace/runtime-resolution.test.ts` expected unsupported `apple-container` to fall back to host, but actual result fell back to Docker/container on this machine. Overall: 33 files passed, 1 failed; 182 tests passed, 1 failed. |
| `pnpm typecheck` | Pass | Turbo typecheck completed successfully for all 15 packages. Homepage emitted existing hints only; no errors. |

Preload/IPC conclusion: the targeted bridge tests passed and no `window.sero` behavior was weakened. The requested combined test command still fails due to a runtime-resolution platform expectation unrelated to preload.

### Packaging

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --dir apps/desktop pack` | Pass, but not Electron packaging | This invokes pnpm's package tarball behavior and produced `sero-desktop-0.1.0.tgz`; it does not exercise `electron-builder`. |
| `pnpm --dir apps/desktop run pack` before builds | Fail | `prepare-packaging.mjs` failed because `dist/renderer/index.html` was missing; this was an expected prerequisite failure in the fresh spike worktree. |
| `pnpm --dir apps/desktop build` | Pass | Built Electron and Vite renderer bundles. Existing warnings only: module-federation `eval` warning and large chunks. |
| `pnpm --dir apps/web-remote build` | Pass | Produced `apps/desktop/electron/features/gateway/web-dist`. Existing large chunk warning only. |
| `pnpm --dir apps/desktop run pack` after builds | Fail | `electron-builder --mac --dir` started packaging with `electron=42.0.0+wvcus` and local `electronDist`, then failed while creating the asar: `/packages/common/package.json must be under /apps/desktop/`. Retrying after deleting `.turbo/turbo-*.log` still failed on the workspace package path. |

Packaging conclusion: Electron app packaging did not pass. The observed blocker is an electron-builder/pnpm workspace symlink path issue surfaced during the pack gate. Native rebuild had already failed earlier, so packaging is also blocked even before app smoke can be trusted.

### Manual smoke matrix

| Smoke item | Result | Reason |
| --- | --- | --- |
| macOS launch smoke | Not available | Electron packaging failed, so there was no packaged app to launch. Starting the dev app would not validate the failed native rebuild/package gate. |
| Docker runtime smoke | Not available | Manual UI runtime smoke was not attempted because native rebuild and packaging were already blocking. Automated runtime/container tests were run as recorded above. |
| Apple Container runtime smoke | Not available | Same blocker; no packaged app/manual UI environment was available. |
| Windows Docker/Podman smoke | Not available | This macOS agent environment does not provide Windows/Podman validation hardware. |

## Electron decision

**Decision:** Defer

### Evidence

- Native rebuild: fail — `better-sqlite3` cannot be rebuilt for Electron 42.0.0 because the current rebuild path cannot detect the Electron 42 ABI (`node-abi` support/update likely required).
- `node-pty`: partial pass — host Node load/spawn works; Electron ABI validation was not completed because the native rebuild gate failed.
- Preload/IPC tests: pass for the targeted preload and runtime-boundary tests; no `window.sero` bridge weakening was needed.
- Runtime/container tests: fail in the combined requested command due to `runtime-resolution.test.ts` platform fallback expectation (`apple-container` fallback selected Docker/container rather than host on this machine).
- `pnpm --dir apps/desktop pack`: pass only as pnpm tarball packaging; real Electron packaging via `pnpm --dir apps/desktop run pack` failed after build prerequisites were satisfied.
- macOS launch smoke: unavailable because packaging failed.
- Docker runtime smoke: unavailable manually; automated tests recorded above.
- Apple Container runtime smoke: unavailable.
- Windows Docker/Podman smoke: unavailable in this agent environment.
- Root typecheck: pass.

### Blockers / follow-ups

- Update the Electron native rebuild toolchain for Electron 42 ABI support, likely by updating the `node-abi` version used by `@electron/rebuild`/the rebuild scripts, then rerun `pnpm rebuild node-pty better-sqlite3` and an Electron-context module load probe.
- Resolve or document the `electron-builder` asar unpack/path failure with pnpm workspace symlinks (`packages/common/package.json must be under apps/desktop`) before proposing the Electron dependency merge.
- Re-run the runtime/container test command and inspect `runtime-resolution.test.ts` fallback expectations on machines where Docker and Apple Container availability differ.
- Complete packaged macOS launch smoke and platform runtime smoke only after native rebuild and packaging gates pass.

Final Electron decision for PR #177: **Defer** the Castlabs Electron 42 upgrade. Keep the dependency/lockfile changes isolated in the spike worktree; do not merge them into the main PR until the native rebuild and packaging blockers are resolved.
