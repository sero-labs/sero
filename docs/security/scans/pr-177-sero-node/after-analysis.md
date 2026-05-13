# PR #177 sero-node hardening after-analysis

## Current promoted candidate summary

As of 2026-05-13, the promoted local candidate is the Ubuntu Noble slim image `sero-node:ubuntu-noble-slim-local` built from `ubuntu:24.04`. It replaces the rejected 4.93 GB Playwright-base image while preserving the required Sero runtime contract. It was **not** tagged as a GHCR image, pushed, or published.

| Item | Value |
| --- | --- |
| Current candidate tag | `sero-node:ubuntu-noble-slim-local` |
| Dockerfile | `apps/desktop/images/Dockerfile.sero-node` |
| Base | `ubuntu:24.04` |
| Node/npm source | pinned official Node.js `24.15.0` Linux tarball with checksum verification; npm upgraded to `11.14.1` |
| Package manager | `pnpm 10.33.4` via Corepack |
| GitHub CLI | `gh 2.92.0` built from source with Go `1.26.3` in a throwaway build stage |
| Native build tooling | present: `build-essential`, `python3`, `python3-venv`, `python3-pip` (`gcc`, `g++`, `make`, `pip`) |
| Browser payload | Playwright Chromium + ffmpeg only; Firefox/WebKit absent |
| Headless-shell compatibility | small `chromium_headless_shell-1200` shim; `headless_shell` is a symlink to `/ms-playwright/chromium-1200/chrome-linux/chrome` |
| Image ID | `sha256:85ab4bbdf0defbe8f2c71436c56f6465143ab877b0e5a83169df1b7b65dcd442` |
| Created | `2026-05-13T12:52:34.993477052Z` |
| Size | `1,843,365,152` bytes (`1.84 GB`) |
| Trivy CRITICAL | `0` |
| Trivy HIGH | `0` |
| Fixable CRITICAL | `0` |
| Fixable HIGH | `0` |
| Direct runtime/browser/build-tool smoke | pass |
| Targeted Docker/browser Vitest | pass: `2` files / `27` tests |
| Desktop typecheck | pass |

The prior Playwright-base candidate `sero-node:node24-noble-buildtools-local` is superseded because it reached CRITICAL=0 but produced an unacceptable `4,931,109,454` byte (`4.93 GB`) final image. The earlier Node 22 `hardening-local` and `critical-zero-local` sections below are retained only as **historical / superseded** investigation notes and are not the current release-gate candidate.

## Final Ubuntu Noble slim validation artifacts

- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-build.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-inspect.json`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-history.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-images.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-runtime-inventory.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-full.json`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-fixable-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-counts.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-trivy-version.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-targeted-tests.txt`
- `docs/security/scans/pr-177-sero-node/final-ubuntu-noble-slim-typecheck.txt`

## Superseded Playwright-base candidate

The Node 24 Noble Playwright-base candidate `sero-node:node24-noble-buildtools-local` reached CRITICAL=0 and preserved functionality, but it is no longer the promoted candidate because the full Playwright base produced a `4,931,109,454` byte (`4.93 GB`) image. Its evidence remains below and in the `node24-noble-buildtools-*` artifacts for historical comparison.

## Historical / superseded Node 22 hardening candidate

Local hardened candidate built and scanned on 2026-05-13.

## Candidate identity

| Item | Value |
| --- | --- |
| Candidate tag | `sero-node:hardening-local` |
| Image ID | `sha256:2c4fbc2864cd6910437c611b2b8d92b90b49d204b7d06b70afbed45dcb7706ca` |
| Created | `2026-05-13T09:47:47.918023542Z` |
| Size | `1,798,935,982` bytes (`1.80 GB`, about `1.68 GiB`) |
| Published/pushed | No |

## Commands run

```bash
docker build \
  -t sero-node:hardening-local \
  --build-arg SERO_NODE_VERSION=hardening-local \
  -f apps/desktop/images/Dockerfile.sero-node \
  apps/desktop/images

docker image inspect sero-node:hardening-local \
  > docs/security/scans/pr-177-sero-node/hardening-local-inspect.json

docker history --no-trunc sero-node:hardening-local \
  > docs/security/scans/pr-177-sero-node/hardening-local-history.txt

docker run --rm sero-node:hardening-local sh -lc '...runtime inventory and browser smoke...'

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --format table \
  --output /out/hardening-local-trivy-high-critical.txt \
  sero-node:hardening-local

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --format table \
  --output /out/hardening-local-trivy-fixable-high-critical.txt \
  sero-node:hardening-local
```

## Before/after comparison

| Metric | Before `ghcr.io/sero-labs/sero-node:latest` | After `sero-node:hardening-local` | Delta | Notes |
| --- | ---: | ---: | ---: | --- |
| Image size | `2,176,370,691` bytes (`2.18 GB`, `2.03 GiB`) | `1,798,935,982` bytes (`1.80 GB`, `1.68 GiB`) | `-377,434,709` bytes (`-17.3%`) | Candidate is local-only and was not pushed. |
| Trivy CRITICAL | 14 | 14 | 0 | Remaining criticals are still unfixed/accepted items from the baseline analysis, including kept runtime/browser/GitHub CLI dependencies. |
| Trivy HIGH | 273 | 82 | -191 | Package removal and `apt-get upgrade` materially reduced HIGH findings. |
| Fixable CRITICAL | 0 | 0 | 0 | No fixable criticals in either scan. |
| Fixable HIGH | 16 | 11 | -5 | `linux-libc-dev` and old Corepack `pnpm@10.11.0` findings were removed; remaining fixable highs are Node/npm package findings (`tar`, `minimatch`, `picomatch`). |
| Root filesystem inventory | `2.1G /` | `1.8G /` | about `-300M` visible in-container | `/root` dropped from `1020M` to `21M`; `/usr` dropped from `1.1G` to `799M`; `/ms-playwright` is `910M` and intentionally retained. |
| Browser toolchain smoke | not rerun in this todo | pass | pass | `bash`, `git`, `node`, `pnpm`, `python3`, `agent-browser`, `/ms-playwright`, Chromium, and ffmpeg were verified in the candidate container. |

## Runtime smoke evidence

`docs/security/scans/pr-177-sero-node/hardening-local-runtime-inventory.txt` records:

- `node` `v22.22.2`
- `npm` `10.9.7`
- `pnpm` `10.27.0`
- `git` `2.39.5`
- `Python 3.11.2`
- `agent-browser 0.27.0`
- `browser-toolchain-smoke=pass`

The direct smoke verified executable paths for `bash`, `git`, `node`, `pnpm`, `python3`, and `agent-browser`, plus executable Chromium and ffmpeg assets under `/ms-playwright`.

## Remaining findings

The hardened candidate still has 14 CRITICAL and 82 HIGH Trivy findings. Per the baseline decision matrix, browser automation remains in the default image for PR #177, and `gh` remains because current GitHub auth/repo/PR workflows shell out to it. The largest retained size contributor is `/ms-playwright` (`910M`), which is intentionally deferred to a later browser/base image split.

Remaining fixable HIGH entries in the candidate scan are Node package findings:

- `tar` `7.5.2` — 6 findings
- `minimatch` `9.0.5` — 3 findings
- `picomatch` `4.0.3` — 2 findings

These appear under bundled/transitive Node tooling after the `pnpm@10.27.0` update and were not manually patched in PR #177.

## Artifacts

- `docs/security/scans/pr-177-sero-node/hardening-local-inspect.json`
- `docs/security/scans/pr-177-sero-node/hardening-local-history.txt`
- `docs/security/scans/pr-177-sero-node/hardening-local-runtime-inventory.txt`
- `docs/security/scans/pr-177-sero-node/hardening-local-images.txt`
- `docs/security/scans/pr-177-sero-node/hardening-local-trivy-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/hardening-local-trivy-fixable-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/hardening-local-trivy-full.json`

## Operational note

Because `apps/desktop/images/Dockerfile.sero-node` changed in the hardening patch, affected workspace containers must be recreated before any in-app smoke test can exercise this candidate image.


## Historical / superseded critical-zero candidate: `node:22-trixie-slim`

A second local-only candidate was built on 2026-05-13 from `node:22-trixie-slim` as `sero-node:critical-zero-local`. It was **not** tagged as a GHCR image, pushed, or published.

### Commands run

```bash
docker build \
  -t sero-node:critical-zero-local \
  --build-arg SERO_NODE_VERSION=critical-zero-local \
  -f apps/desktop/images/Dockerfile.sero-node \
  apps/desktop/images

docker run --rm sero-node:critical-zero-local sh -lc '...direct tool/browser smoke...'

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --format json \
  --output /out/critical-zero-local-trivy-full.json \
  sero-node:critical-zero-local

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --format table \
  --output /out/critical-zero-local-trivy-fixable-high-critical.txt \
  sero-node:critical-zero-local
```

### Candidate comparison

| Metric | Baseline `ghcr.io/sero-labs/sero-node:latest` | `sero-node:hardening-local` | `sero-node:critical-zero-local` | Release-gate status |
| --- | ---: | ---: | ---: | --- |
| Base | Debian 12 / `node:22-slim` | Debian 12 / `node:22-slim` | Debian 13 / `node:22-trixie-slim` | Candidate only |
| Image size | `2,176,370,691` bytes | `1,798,935,982` bytes | `1,827,378,479` bytes | local-only |
| Trivy CRITICAL | 14 | 14 | 10 | **Blocked: not zero** |
| Trivy HIGH | 273 | 82 | 73 | improved |
| Fixable CRITICAL | 0 | 0 | 0 | not sufficient |
| Fixable HIGH | 16 | 11 | 11 | unchanged vs hardening-local |
| Direct smoke | n/a | pass | pass | required tools/assets present |

### Remaining CRITICAL findings in `critical-zero-local`

Trivy still reports **10 CRITICAL** findings, so the trixie candidate does **not** satisfy the CRITICAL=0 release target. Exact remaining critical packages from `critical-zero-local-trivy-full.json`:

| Package | Count | CVE(s) | Likely source / next action |
| --- | ---: | --- | --- |
| `libgbm1` | 1 | `CVE-2026-40393` | Browser/Mesa stack from Playwright `--with-deps`; removing/replacing requires browser-runtime evidence. |
| `libgl1-mesa-dri` | 1 | `CVE-2026-40393` | Browser/Mesa stack from Playwright `--with-deps`. |
| `libglx-mesa0` | 1 | `CVE-2026-40393` | Browser/Mesa stack from Playwright `--with-deps`. |
| `mesa-libgallium` | 1 | `CVE-2026-40393` | Browser/Mesa stack from Playwright `--with-deps`. |
| `xserver-common` | 2 | `CVE-2026-34000`, `CVE-2026-34002` | Pulled by `xvfb`; browser automation contract currently expects Playwright deps. |
| `xvfb` | 2 | `CVE-2026-34000`, `CVE-2026-34002` | Installed by Playwright `--with-deps`; removing may break headful/browser recording paths. |
| `libgnutls30t64` | 1 | `CVE-2026-33845` | Pulled by `wget`, `git`/`libcurl3t64-gnutls`, and browser `libcups2t64`; replacement/removal needs runtime contract review. |
| `libssh2-1t64` | 1 | `CVE-2026-7598` | Pulled by `libcurl` packages used by `git`/`curl`; removing `git` is not credible for this product. |

### Critical-zero conclusion

Switching to `node:22-trixie-slim` improves the scan from 14 to 10 CRITICAL and from 82 to 73 HIGH while preserving the current runtime/browser contract, but it does **not** reach scanner-zero. PR #177 must remain blocked for the stated CRITICAL=0 goal unless follow-up work removes/replaces the remaining browser/Mesa/Xvfb and GnuTLS/libssh2 sources with smoke-backed alternatives. No risky removals were made in this pass.

### Additional critical-zero artifacts

- `docs/security/scans/pr-177-sero-node/critical-zero-local-inspect.json`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-history.txt`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-runtime-inventory.txt`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-images.txt`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-trivy-full.json`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-trivy-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-trivy-fixable-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-critical-rdepends.txt`
- `docs/security/scans/pr-177-sero-node/critical-zero-local-critical-depends.txt`

## Superseded Node 24 Noble Playwright candidate before build-tool restore

The tested Noble Playwright path was promoted into `apps/desktop/images/Dockerfile.sero-node` on 2026-05-13. This pre-build-tool candidate was built locally as `sero-node:node24-noble-local` and was **not** tagged as a GHCR image, pushed, or published. It is superseded by `sero-node:node24-noble-buildtools-local`, which restores `build-essential` and `python3-pip` while preserving CRITICAL=0.

### Candidate identity

| Item | Value |
| --- | --- |
| Candidate tag | `sero-node:node24-noble-local` |
| Dockerfile | `apps/desktop/images/Dockerfile.sero-node` |
| Base | `mcr.microsoft.com/playwright:v1.57.0-noble` |
| Node/npm source | base image (`node v24.15.0`, `npm 11.12.1`) |
| Image ID | `sha256:c5d30e27abf1e699970fe8035d3dfeb7b4f9bc0c61f1966c18f5d1dd3635e93a` |
| Created | `2026-05-13T11:10:58.291308216Z` |
| Size | `4,682,632,233` bytes (`4.68 GB`) |
| Published/pushed | No |

### Validation summary

| Metric | `sero-node:node24-noble-local` | Evidence |
| --- | ---: | --- |
| Trivy total vulnerabilities | 422 | `node24-noble-trivy-full.json`, `node24-noble-trivy-counts.txt` |
| Trivy CRITICAL | 0 | `node24-noble-trivy-full.json` |
| Trivy HIGH | 18 | `node24-noble-trivy-high-critical.txt` |
| Fixable CRITICAL | 0 | `node24-noble-trivy-fixable-high-critical.txt` |
| Fixable HIGH | 16 | `node24-noble-trivy-fixable-high-critical.txt` |
| Direct runtime/browser smoke | pass | `node24-noble-runtime-inventory.txt` |
| Targeted Docker/browser Vitest | pass: 2 files / 27 tests | `node24-noble-targeted-tests.txt` |
| Desktop typecheck | pass | `node24-noble-typecheck.txt` |

### Runtime contract confirmed

Direct smoke confirmed the required tools/assets are present:

- `node v24.15.0`
- `npm 11.12.1`
- `pnpm 10.27.0`
- `git version 2.43.0`
- `gh version 2.92.0 (2026-04-28)` from the official GitHub CLI apt repository
- `Python 3.12.3`
- `agent-browser 0.27.0`
- `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
- Chromium executable `/ms-playwright/chromium-1200/chrome-linux/chrome` (`Chromium 143.0.7499.4`)
- ffmpeg executable `/ms-playwright/ffmpeg-1011/ffmpeg-linux` and `/usr/local/bin/ffmpeg`
- `/usr/bin/tini` entrypoint
- writable `/workspace` and `/tmp/sero-home`

### Final conclusion

The promoted Node 24 Noble Playwright candidate satisfies the stated scanner goal (`CRITICAL=0`) while preserving the Sero runtime contract for Git/GitHub CLI and browser automation. Release publication remains blocked until explicit publish approval is given and manual in-app Docker smoke is completed with recreated workspace containers.

## Current Node 24 Noble buildtools artifacts

- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-inspect.json`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-history.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-images.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-runtime-inventory.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-trivy-full.json`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-trivy-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-trivy-fixable-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-trivy-counts.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-trivy-version.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-targeted-tests.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-buildtools-typecheck.txt`

## Superseded Node 24 Noble artifacts

- `docs/security/scans/pr-177-sero-node/node24-noble-inspect.json`
- `docs/security/scans/pr-177-sero-node/node24-noble-history.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-runtime-inventory.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-trivy-full.json`
- `docs/security/scans/pr-177-sero-node/node24-noble-trivy-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-trivy-fixable-high-critical.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-trivy-counts.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-trivy-version.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-targeted-tests.txt`
- `docs/security/scans/pr-177-sero-node/node24-noble-typecheck.txt`
