# Clean Launch Validation Report

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/clean-clone-report.md`

## Clone identity

- Source: local clean clone from the current repository
- Temp clone path: `/tmp/sero-clean-clone-R4a8Gh`
- Branch validated: `feat/release-prep`
- Final validated commit: `3b80f7b1a6cd31491b022836e827f4cec212a5b4`

## Machine identity

- macOS: `26.3` (`25D125`)
- Architecture: `arm64`
- Node: `v22.22.0`
- pnpm: `10.11.0`

## Validation goal

Validate the remaining clean-clone release-engineering gap beyond install /
typecheck / test / build: confirm the desktop app can launch on a supported
machine from a clean clone.

## Validation approach

Because this validation was run on an already-used maintainer machine, the dev
launch smoke used an isolated profile root via `SERO_HOME_OVERRIDE` to avoid
mutating existing local Sero state during the check.

This wave used two complementary checks:

1. **Dev-launch smoke** via `apps/desktop/scripts/dev.sh`
2. **Built-app launch/UI smoke** via the focused Playwright
   `e2e/app-launch.spec.ts` suite

The second check is broader than a pure "does it open" smoke in some ways, but
it is still not a full substitute for complete local/manual coverage. It was
used here as supporting launch evidence, not as the only proof.

## Results

| Check | Result | Notes |
| --- | --- | --- |
| `SERO_HOME_OVERRIDE=/tmp/sero-clean-launch-home-final bash scripts/dev.sh` | ✅ pass | Vite host came up, Electron launcher stayed alive long enough for smoke verification, logs were written |
| `CI=1 pnpm exec playwright test e2e/app-launch.spec.ts --project=ci` | ✅ pass | `6 passed`, `5 skipped`; confirms built app launch and key IPC surfaces in CI-style mode |
| `pnpm exec playwright test e2e/app-launch.spec.ts --project=local` | ✅ pass | `11 passed`; confirms visible window and core shell rendering in local mode |

## Dev-launch smoke evidence

Command run from the clean clone:

```bash
cd apps/desktop
SERO_HOME_OVERRIDE=/tmp/sero-clean-launch-home-final bash scripts/dev.sh
```

Observed successful startup behavior:
- `scripts/dev.sh` rebuilt Electron successfully
- Vite host started on `http://localhost:5173`
- Electron launcher PID was reported in the startup summary
- expected log files were created:
  - `/tmp/sero-vite.log`
  - `/tmp/sero-electron.log`
  - `/tmp/sero-web-remote-watch.log`
- startup summary showed built-in plugin remotes loading from prebuilt bundles:
  - `admin cron git mcp userfeedback web`

Observed startup caveat:
- a non-blocking Node warning appeared during startup:
  - `MODULE_TYPELESS_PACKAGE_JSON` for
    `apps/desktop/electron/platform/protocols/builtin-package-detection.js`
- this did **not** block launch

The dev smoke was intentionally terminated after startup was confirmed. This was
not a prolonged manual UX session.

## Built-app launch smoke evidence

### CI-style focused launch smoke

Command:

```bash
CI=1 pnpm exec playwright test e2e/app-launch.spec.ts --project=ci
```

Result:
- `6 passed`
- `5 skipped`

This confirms the built desktop app launched from `dist/electron/main.mjs` and
exposed the expected core IPC/API surfaces in CI-style mode.

### Local focused launch/UI smoke

Command:

```bash
pnpm exec playwright test e2e/app-launch.spec.ts --project=local
```

Result:
- `11 passed`

This specifically confirmed:
- a visible window was created
- the window title was set
- the main app shell rendered
- the title bar rendered
- the status bar rendered
- sidebar/chat toggle controls rendered
- renderer `window.sero` APIs were available
- workspace / agent / VCS IPC bridges were available

## Caveats

- This wave did **not** run the full local Playwright suite (`test:e2e:local`).
- This wave did **not** exercise `container.spec.ts` as a dedicated release
  check.
- This wave did **not** validate packaging/signing/notarization flows.
- The `scripts/dev.sh` smoke used `SERO_HOME_OVERRIDE` for isolation, so it did
  not mutate the maintainer's real `~/.sero-ui` profile state.
- `/tmp/sero-electron.log` remained quiet during the smoke; launch confidence is
  therefore based on the successful dev summary, live host, and the passing
  focused Playwright launch tests.

## Raw log references

Saved local transcripts from this run:
- `/tmp/sero-clean-clone-pull-3.log`
- `/tmp/sero-clean-launch-driver-final.log`
- `/tmp/sero-clean-launch-curl-final.txt`
- `/tmp/sero-clean-clone-app-launch-ci-final.log`
- `/tmp/sero-clean-clone-app-launch-local-final.log`
- `/tmp/sero-vite.log`
- `/tmp/sero-electron.log`
- `/tmp/sero-web-remote-watch.log`

## Conclusion

The clean clone now has supporting evidence for **desktop launch on a supported
machine**:
- the dev launcher starts successfully from `apps/desktop/`
- the host responds on `http://localhost:5173`
- focused built-app launch smoke passes in both CI-style and local modes

This is sufficient to close the checklist item for clean-clone install → run
validation at the OSS alpha level, while leaving full local/container/manual
smoke depth as a later hardening step.
