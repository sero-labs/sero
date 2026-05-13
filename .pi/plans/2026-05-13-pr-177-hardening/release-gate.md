# PR #177 hardening release gate

Updated 2026-05-13 after promoting the Ubuntu Noble slim Docker path.

## Combined decision

**Decision: automated Docker scanner gate is satisfied by the promoted Ubuntu Noble slim local candidate, but release publication remains blocked pending explicit approval and manual in-app smoke.**

- `apps/desktop/images/Dockerfile.sero-node` now uses `ubuntu:24.04`, not the full Playwright base.
- Node 24 is pinned to `24.15.0` and installed from the official Node.js Linux tarball with checksum verification; npm comes from that tarball.
- `pnpm@10.27.0` is activated via Corepack.
- Git, current official GitHub CLI apt repo/`gh`, native build tooling, core CLI utilities, `agent-browser`, Playwright Chromium, and Playwright ffmpeg are preserved.
- Firefox and WebKit payloads are absent.
- The large Chromium headless-shell payload is replaced by a documented symlink compatibility shim to the regular Chromium binary.
- The promoted validation image `sero-node:ubuntu-noble-slim-local` reaches **Trivy CRITICAL=0** at **1,797,729,335 bytes (~1.8 GB)**.
- No GHCR image was tagged, pushed, or published.
- Publishing a release image still requires explicit user approval.
- Manual in-app Docker smoke is still required with recreated workspace containers before release.
- Electron Track B remains deferred; do not merge the Castlabs Electron spike into PR #177.

## Docker runtime image

| Item | Baseline | Superseded Node 22 hardening | Superseded Playwright-base candidate | Promoted Ubuntu Noble slim candidate | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| Image | `ghcr.io/sero-labs/sero-node:latest` | `sero-node:hardening-local` / `critical-zero-local` | `sero-node:node24-noble-buildtools-local` | `sero-node:ubuntu-noble-slim-local` | local-only candidate |
| Base | Debian 12 / `node:22-slim` | Debian Node 22 candidates | `mcr.microsoft.com/playwright:v1.57.0-noble` | `ubuntu:24.04` | promoted Dockerfile path |
| Node | v22 | v22 | v24.15.0 | v24.15.0 | accepted Node 24 path |
| Image size | `2,176,370,691` bytes | `1,798,935,982` to `1,827,378,479` bytes | `4,931,109,454` bytes | `1,797,729,335` bytes | size-corrected |
| Trivy CRITICAL | 14 | 14 / 10 | 0 | 0 | **scanner gate satisfied** |
| Trivy HIGH | 273 | 82 / 73 | 18 | 16 | improved |
| Fixable CRITICAL | 0 | 0 | 0 | 0 | pass |
| Fixable HIGH | 16 | 11 | 16 | 16 | documented |
| Direct smoke | n/a | pass | pass | pass | required tools/assets present |
| Targeted Docker/browser tests | n/a | pass | pass: 2 files / 27 tests | pass: 2 files / 27 tests | automated pass |
| Desktop typecheck | n/a | pass | pass | pass | automated pass |

## Docker release requirements

Before any release publication:

1. Obtain explicit user approval to publish/tag/push a GHCR image.
2. Rebuild the approved release image from the final Dockerfile. Node is pinned to `24.15.0`; if the pin changes, rerun Trivy counts, runtime inventory, targeted Docker/browser tests, and desktop typecheck before tagging/pushing.
3. Do not publish/tag/push `ghcr.io/sero-labs/sero-node:*` without explicit approval.
4. Recreate affected workspace containers so the new Node 24 Noble toolchain/image contents are actually exercised.
5. Complete manual in-app Docker smoke:
   - Docker workspace opens.
   - Shell can write/read files.
   - Git works.
   - LSP initializes.
   - Managed dev server works.
   - Browser automation works.

## Evidence artifacts

- `docs/security/scans/pr-177-sero-node/after-analysis.md`
- `docs/security/scans/pr-177-sero-node/runtime-validation.md`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-inspect.json`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-history.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-images.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-runtime-inventory.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-full.json`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-fixable-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-counts.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-targeted-tests.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-typecheck.txt`

## Deferred browser-size follow-up

Sero does not use Playwright as a production JS API directly; it shells out to `agent-browser`, which needs a browser executable and ffmpeg. PR #177 keeps the validated Playwright Chromium/ffmpeg assets because they are multi-arch and pass CRITICAL=0, but a future size-optimization PR can relax the `/ms-playwright` image contract and validate system Chrome/Chromium, Chrome for Testing, `@sparticuz/chromium`, or another lightweight provider on both amd64 and arm64 before removing the current assets.

## Castlabs Electron

**Decision: defer** the Castlabs Electron 42 upgrade for PR #177. Keep Electron dependency changes out of PR #177 until the native rebuild and packaging blockers documented in the Electron evaluation are resolved.
