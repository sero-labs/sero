# PR #177 Docker runtime validation

## Current promoted candidate summary

Validation was rerun on 2026-05-13 against the current promoted local-only candidate image `sero-node:ubuntu-noble-slim-local`. The image uses `ubuntu:24.04`, installs official Node 24 with checksum verification, keeps Git/GitHub CLI/native build tooling, and includes only Playwright Chromium + ffmpeg browser assets. It was **not** tagged as a GHCR image, pushed, or published.

| Gate | Result | Evidence |
| --- | --- | --- |
| Direct candidate container smoke | pass | `node`, `npm`, `pnpm`, `git`, `gh`, `python3`, `pip`, `gcc`, `g++`, `make`, core CLI tools, `agent-browser`, `/ms-playwright`, Chromium, ffmpeg, `tini`, `/workspace`, and `/tmp/sero-home` verified in `final-ubuntu-noble-slim-runtime-inventory.txt`. |
| Image size | `1,797,729,335` bytes (`1.80 GB`) | `final-ubuntu-noble-slim-inspect.json` |
| Trivy CRITICAL=0 | pass | `final-ubuntu-noble-slim-trivy-full.json` / `final-ubuntu-noble-slim-trivy-counts.txt` |
| Trivy HIGH | `16` | `final-ubuntu-noble-slim-trivy-high-critical.txt` |
| Fixable HIGH/CRITICAL | `16` / `0` | `final-ubuntu-noble-slim-trivy-fixable-high-critical.txt` |
| Browser payload check | pass | `/ms-playwright` contains `.links`, `chromium-1200`, `chromium_headless_shell-1200`, `ffmpeg-1011`; no Firefox/WebKit directories. |
| Headless-shell shim | pass | `headless_shell` is a symlink to `/ms-playwright/chromium-1200/chrome-linux/chrome`. |
| Targeted Docker/browser Vitest | pass | `2` files / `27` tests in `final-ubuntu-noble-slim-targeted-tests.txt` |
| Desktop typecheck | pass | `final-ubuntu-noble-slim-typecheck.txt` |
| Manual in-app Docker smoke | blocked / unavailable in this agent session | No interactive Electron app session or controllable Sero UI is available from this non-interactive coding-agent environment. Affected workspace containers must be recreated before testing. |

The older Playwright-base candidate `sero-node:node24-noble-buildtools-local` is **superseded** by this Ubuntu Noble slim candidate because the full Playwright base produced an unacceptable `4.93 GB` image. The older Node 22 `hardening-local` / `critical-zero-local` validation sections below are **historical / superseded** and are not the current release-gate candidate.

## Current automated commands

```bash
docker build   -t sero-node:ubuntu-noble-slim-local   --build-arg SERO_NODE_VERSION=ubuntu-noble-slim-local   -f apps/desktop/images/Dockerfile.sero-node   .

docker run --rm sero-node:ubuntu-noble-slim-local sh -lc '...direct tool/browser smoke...'

docker run --rm   -v /var/run/docker.sock:/var/run/docker.sock   -v "$PWD/docs/security/scans/pr-177-sero-node:/out"   aquasec/trivy:latest image   --format json   --output /out/final-ubuntu-noble-slim-trivy-full.json   sero-node:ubuntu-noble-slim-local

pnpm --filter @sero/desktop exec vitest run   electron/__tests__/features/workspace/runtime/docker-backend.test.ts   electron/__tests__/features/container/tools-browser-agent.test.ts

pnpm --filter @sero/desktop typecheck
```

## Current observed versions and assets

```text
node=v24.15.0
npm=11.12.1
pnpm=10.27.0
git=git version 2.43.0
gh version 2.92.0 (2026-04-28)
python=Python 3.12.3
pip=24.0
gcc/g++=13.3.0
make=GNU Make 4.3
agent-browser 0.27.0
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
Chromium 143.0.7499.4
ffmpeg version n7.0.1-playwright-build-1011
/ms-playwright: .links, chromium-1200, chromium_headless_shell-1200, ffmpeg-1011
Firefox/WebKit: absent
headless_shell: symlink to /ms-playwright/chromium-1200/chrome-linux/chrome
```

## Current Trivy counts

```text
TOTAL=1081
CRITICAL=0
HIGH=16
MEDIUM=1003
LOW=62
FIXABLE_CRITICAL=0
FIXABLE_HIGH=16
FIXABLE_MEDIUM=15
FIXABLE_LOW=0
```

## Current release-gate decision

Automated validation for the promoted Ubuntu Noble slim Docker path passes, including `CRITICAL=0`, direct runtime/browser smoke, targeted runtime/browser tests, and desktop typecheck. The full Docker release gate still requires explicit publish approval and manual in-app Docker smoke with recreated workspace containers.

## Historical / superseded Node 22 validation

Validation was run on 2026-05-13 against the local-only candidate image `sero-node:hardening-local`. The image was not published or pushed.

## Summary

| Gate | Result | Evidence |
| --- | --- | --- |
| Runtime/container Vitest command | pass with precise directory paths | `31` files / `166` tests passed. The exact no-trailing-slash command also surfaced one unrelated sibling test failure; see note below. |
| Desktop typecheck | pass | `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit` completed with exit code 0. |
| Root typecheck | pass | `turbo run typecheck`: `15 successful, 15 total`. |
| Direct candidate container smoke | pass | `node`, `pnpm`, `git`, `python3`, `agent-browser`, and readable `/ms-playwright` verified in `sero-node:hardening-local`. |
| Manual in-app Docker smoke | blocked / unavailable in this agent session | No interactive Electron app session or controllable Sero UI is available from this non-interactive coding-agent environment. Existing workspace containers were not reused; in-app smoke must recreate affected containers before testing. |

**Docker Track A status:** automated Docker runtime validation passes for `sero-node:hardening-local`; the full release gate is **blocked pending manual in-app Docker smoke** because this agent session cannot exercise the Electron UI/workspace lifecycle.

## Automated commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --filter @sero/desktop exec vitest run electron/__tests__/features/workspace/runtime electron/__tests__/features/container` | fail | Vitest treated `electron/__tests__/features/workspace/runtime` as a substring pattern and also ran sibling `electron/__tests__/features/workspace/runtime-resolution.test.ts`; one platform-fallback expectation failed (`expected actualBackend host`, received `docker`). This failure is outside the runtime directory and does not exercise the hardened image. |
| `pnpm --filter @sero/desktop exec vitest run electron/__tests__/features/workspace/runtime/ electron/__tests__/features/container/` | pass | Precise directory-path rerun passed: `31` test files, `166` tests. |
| `pnpm --filter @sero/desktop typecheck` | pass | Desktop renderer and Electron TypeScript checks completed with exit code 0. |
| `pnpm typecheck` | pass | Turbo typecheck completed: `15 successful, 15 total`; homepage reported existing hints only, no errors. |

### Vitest detail

Passing command used for the runtime/container gate:

```bash
pnpm --filter @sero/desktop exec vitest run \
  electron/__tests__/features/workspace/runtime/ \
  electron/__tests__/features/container/
```

Result:

```text
Test Files  31 passed (31)
Tests       166 passed (166)
```

The exact command from the checklist without trailing slashes was also run and recorded. It failed because `runtime-resolution.test.ts` matched the `runtime` filter string even though it is a sibling of `features/workspace/runtime/`:

```text
FAIL electron/__tests__/features/workspace/runtime-resolution.test.ts > resolveWorkspaceRuntime > falls back when the desired backend is unsupported on the current platform
AssertionError: expected actualBackend: "host"; received actualBackend: "docker"
```

No source or test files were changed as part of this validation.

## Direct candidate smoke

Command:

```bash
docker run --rm sero-node:hardening-local sh -lc '
  node --version && pnpm --version && git --version && python3 --version
  command -v agent-browser
  test -r /ms-playwright
'
```

Output:

```text
v22.22.2
10.27.0
git version 2.39.5
Python 3.11.2
/usr/local/bin/agent-browser
```

Result: pass. `test -r /ms-playwright` exited successfully.

## Manual app smoke

Manual in-app smoke was not completed in this agent environment. Reason: this is a non-interactive coding-agent session with no controllable Electron desktop UI, so it cannot create/open Sero workspaces, recreate affected workspace containers through the app, or verify UI-visible LSP/dev-server/browser automation behavior.

Before manual smoke, affected workspace containers must be recreated so the Dockerfile/tool changes in `sero-node:hardening-local` are actually exercised.

Checklist for the follow-up interactive smoke:

- [ ] Recreate affected Docker workspace containers so they use the hardened image/toolchain.
- [ ] Docker workspace opens.
- [ ] Shell can write/read files.
- [ ] Git works.
- [ ] LSP initializes.
- [ ] Managed dev server works.
- [ ] Browser automation works.

## Platform notes

- macOS direct Docker CLI validation passed against `sero-node:hardening-local`.
- Windows validation remains scoped to Docker/Podman runtime behavior only. No Windows host runtime expectation is introduced here.
- Electron upgrade/native-module validation is intentionally out of scope for this Docker report.

## Release-gate decision

- Automated runtime/container tests: pass with precise directory paths.
- Typechecks: pass.
- Direct `docker run` candidate smoke: pass.
- Manual in-app Docker smoke: blocked/unavailable in this session.

**Decision:** Docker Track A is acceptable for automated validation, but the full PR #177 Docker release gate remains **blocked pending manual in-app Docker smoke** with recreated workspace containers.


## Historical / superseded critical-zero candidate direct smoke

Validation was also run on 2026-05-13 against the local-only `sero-node:critical-zero-local` candidate built from `node:22-trixie-slim`. The image was not published or pushed.

Command:

```bash
docker run --rm sero-node:critical-zero-local sh -lc '
  set -eu
  node --version
  npm --version
  pnpm --version
  git --version
  gh --version | head -2
  python3 --version
  command -v agent-browser
  agent-browser --version || true
  test -r /ms-playwright
  find /ms-playwright -path "*/chrome" -type f -perm -111 -print -quit
  find /ms-playwright -path "*/ffmpeg-linux" -type f -perm -111 -print -quit
  command -v ffmpeg
  ffmpeg -version | head -1
  echo browser-toolchain-smoke=pass
'
```

Observed output includes:

```text
v22.22.2
10.9.7
10.27.0
git version 2.47.3
gh version 2.46.0 (2025-01-13 Debian 2.46.0-3)
Python 3.13.5
/usr/local/bin/agent-browser
agent-browser 0.27.0
/ms-playwright/chromium-1200/chrome-linux/chrome
/ms-playwright/ffmpeg-1011/ffmpeg-linux
/usr/local/bin/ffmpeg
ffmpeg version n7.0.1-playwright-build-1011 Copyright (c) 2000-2024 the FFmpeg developers
browser-toolchain-smoke=pass
```

Result: direct smoke passed for the required runtime/browser contract (`gh`, `agent-browser`, `/ms-playwright`, Chromium, ffmpeg, git, node, pnpm, python3). The release gate is nevertheless blocked because Trivy reports 10 CRITICAL findings for this candidate.

## Superseded Node 24 Noble Playwright validation before build-tool restore

Validation was run on 2026-05-13 against the local-only image `sero-node:node24-noble-local`. The image was not published or pushed. This candidate is superseded by `sero-node:node24-noble-buildtools-local`, which restores `build-essential` and `python3-pip` while preserving CRITICAL=0.

### Summary

| Gate | Result | Evidence |
| --- | --- | --- |
| Direct candidate container smoke | pass | Required tools, browser assets, `tini`, `/workspace`, and `/tmp/sero-home` verified in `node24-noble-runtime-inventory.txt`. |
| Trivy CRITICAL=0 | pass | `node24-noble-trivy-full.json` and `node24-noble-trivy-counts.txt` report `CRITICAL=0`. |
| Targeted Docker/browser Vitest | pass | `2` files / `27` tests passed in `node24-noble-targeted-tests.txt`. |
| Desktop typecheck | pass | `pnpm --filter @sero/desktop typecheck` completed with exit code 0; see `node24-noble-typecheck.txt`. |
| Manual in-app Docker smoke | blocked / unavailable in this agent session | No interactive Electron app session or controllable Sero UI is available from this non-interactive coding-agent environment. Affected workspace containers must be recreated before testing. |

### Commands run

```bash
docker build \
  -t sero-node:node24-noble-local \
  --build-arg SERO_NODE_VERSION=node24-noble-local \
  -f apps/desktop/images/Dockerfile.sero-node \
  apps/desktop/images

docker run --rm sero-node:node24-noble-local sh -lc '...direct tool/browser smoke...'

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --format json \
  --output /out/node24-noble-trivy-full.json \
  sero-node:node24-noble-local

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --format table \
  --output /out/node24-noble-trivy-high-critical.txt \
  sero-node:node24-noble-local

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --format table \
  --output /out/node24-noble-trivy-fixable-high-critical.txt \
  sero-node:node24-noble-local

pnpm --filter @sero/desktop exec vitest run \
  electron/__tests__/features/workspace/runtime/docker-backend.test.ts \
  electron/__tests__/features/container/tools-browser-agent.test.ts

pnpm --filter @sero/desktop typecheck
```

### Observed versions and assets

```text
node=v24.15.0
npm=11.12.1
pnpm=10.27.0
git=git version 2.43.0
gh version 2.92.0 (2026-04-28)
python=Python 3.12.3
agent-browser 0.27.0
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
Chromium 143.0.7499.4
ffmpeg version n7.0.1-playwright-build-1011
```

### Trivy counts

```text
TOTAL=422
HIGH=18
CRITICAL=0
FIXABLE_HIGH=16
FIXABLE_CRITICAL=0
```

### Release-gate decision

Automated validation for the promoted Docker path passes, including `CRITICAL=0`, targeted runtime/browser tests, and desktop typecheck. The full Docker release gate still requires explicit publish approval and manual in-app Docker smoke with recreated workspace containers.
