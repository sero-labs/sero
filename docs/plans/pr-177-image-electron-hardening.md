# PR #177 Docker Image + Electron Hardening Plan

## Goal

Before releasing PR #177, complete two independent hardening tracks:

1. **Docker runtime image hardening** — reduce `ghcr.io/sero-labs/sero-node:latest` size and fix/understand high/critical vulnerabilities.
2. **Castlabs Electron upgrade** — evaluate and, if safe, upgrade `apps/desktop` from `v33.4.11+wvcus` to a current Castlabs Electron release.

Keep the tracks separate so Docker image findings do not get conflated with desktop Electron risk.

## Constraints

- Do not publish a new release image or push final commits without explicit approval.
- Keep PR #177 runtime behavior stable across `host`, `docker`, and `apple-container` where supported.
- Windows support is Docker/Podman only; Windows Host runtime has been removed.
- Docker/Podman runtime requires a local engine that can bind-mount workspace paths. Remote Mac Docker from a Windows VM is not valid runtime parity.
- Source files must remain under 500 LOC.

---

## Track A — Docker Runtime Image Hardening

### A1. Capture baseline image metadata

Create an evidence directory:

```bash
mkdir -p docs/security/scans/pr-177-sero-node
```

Capture image identity, size, layers, and package inventory:

```bash
docker image inspect ghcr.io/sero-labs/sero-node:latest \
  > docs/security/scans/pr-177-sero-node/image-inspect.json

docker history --no-trunc ghcr.io/sero-labs/sero-node:latest \
  > docs/security/scans/pr-177-sero-node/image-history.txt

docker run --rm ghcr.io/sero-labs/sero-node:latest sh -lc '
  uname -a
  node --version
  npm --version
  pnpm --version
  python3 --version
  du -xh -d 1 / 2>/dev/null | sort -h | tail -40
  du -xh -d 2 /ms-playwright /usr/local /usr/lib /opt 2>/dev/null | sort -h | tail -80
' > docs/security/scans/pr-177-sero-node/runtime-inventory.txt
```

### A2. Export Docker Scout reports

Run Docker Scout if available:

```bash
docker scout cves ghcr.io/sero-labs/sero-node:latest \
  --format markdown \
  > docs/security/scans/pr-177-sero-node/scout-cves.md

docker scout cves ghcr.io/sero-labs/sero-node:latest \
  --format sarif \
  > docs/security/scans/pr-177-sero-node/scout-cves.sarif

docker scout recommendations ghcr.io/sero-labs/sero-node:latest \
  > docs/security/scans/pr-177-sero-node/scout-recommendations.txt
```

If Scout formatting differs by Docker version, capture plain text instead:

```bash
docker scout cves ghcr.io/sero-labs/sero-node:latest \
  > docs/security/scans/pr-177-sero-node/scout-cves.txt
```

### A3. Export Trivy reports

Use containerized Trivy so the host does not need a local install:

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --format json \
  --output /out/trivy-full.json \
  ghcr.io/sero-labs/sero-node:latest

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --format table \
  --output /out/trivy-high-critical.txt \
  ghcr.io/sero-labs/sero-node:latest

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --severity CRITICAL,HIGH \
  --ignore-unfixed \
  --format table \
  --output /out/trivy-fixable-high-critical.txt \
  ghcr.io/sero-labs/sero-node:latest
```

Optional SARIF for GitHub/code-scanning compatible review:

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/docs/security/scans/pr-177-sero-node:/out" \
  aquasec/trivy:latest image \
  --format sarif \
  --output /out/trivy.sarif \
  ghcr.io/sero-labs/sero-node:latest
```

### A4. Summarize root causes

Create `docs/security/scans/pr-177-sero-node/analysis.md` with:

- Current image digest and size.
- Total critical/high/medium/low counts from Scout and Trivy.
- Fixable critical/high counts.
- Top vulnerable package groups:
  - Debian OS packages from `node:22-slim`.
  - `gh` / Go stdlib packages.
  - global npm packages (`agent-browser`, `pnpm`, transitive npm packages).
  - Playwright browser dependencies and `/ms-playwright` size.
- Top layer size contributors.
- Which findings are runtime-relevant vs scanner noise.

### A5. Hardening implementation candidates

Implement in small commits after baseline analysis.

#### A5.1 Remove or move non-essential tools

Review each tool in `apps/desktop/images/Dockerfile.sero-node`:

- Likely remove from default image: `gh`, `vim`, `dnsutils`, `net-tools`.
- Consider moving to an optional/full image: `build-essential`, `python3-pip`.
- Keep default runtime essentials: `tini`, `git`, `openssh-client`, `curl`, `ca-certificates`, `procps`, `less`, `jq`, `ripgrep`, `fd-find`, `python3`, `python3-venv`, archive tools, `sqlite3`.

Validate that removing `gh` does not break Git plugin or auth flows. If `gh` is required, install a current version from GitHub releases or move it to a separate image/tool path.

#### A5.2 Split browser automation from base image

Current browser install creates the largest layer (~1.38 GB). Split into:

- `sero-node-base`: shell/git/node/python/runtime tools only.
- `sero-node-browser`: extends base and adds `agent-browser`, Chromium, ffmpeg, and Playwright deps.

Then choose one of:

1. Use browser image only for workspaces that need browser automation.
2. Lazily install/browser-cache into a named volume on first browser use.
3. Keep one image for PR #177 but create a follow-up if switching runtime image selection is too invasive.

Acceptance target: default non-browser runtime image should be substantially below current 2.18 GB.

#### A5.3 Update package-manager/tooling pins

If Trivy/Scout flags `pnpm@10.11.0` or npm tooling:

- Update root `packageManager` and Dockerfile together.
- Run full typecheck/tests.
- Verify Corepack behavior in host and Docker runtime.

#### A5.4 Use newer base image and package upgrades

Evaluate current `node:22-slim` digest vs newer `node:22-bookworm-slim` or current Node LTS slim tag.

Build with package upgrades:

```dockerfile
RUN apt-get update -qq && \
    apt-get upgrade -y -qq && \
    apt-get install -y -qq --no-install-recommends ... && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
```

Only keep `apt-get upgrade` if it materially reduces fixable CVEs and does not hurt reproducibility too much.

### A6. Rebuild and compare

Build local candidate image:

```bash
docker build \
  -t sero-node:hardening-local \
  --build-arg SERO_NODE_VERSION=hardening-local \
  -f apps/desktop/images/Dockerfile.sero-node \
  apps/desktop/images
```

Run runtime toolchain smoke:

```bash
docker run --rm sero-node:hardening-local sh -lc '
  command -v bash
  command -v git
  command -v node
  command -v python3
  command -v agent-browser || true
  test -d /ms-playwright || true
'
```

Run size and vulnerability comparison:

```bash
docker images ghcr.io/sero-labs/sero-node:latest sero-node:hardening-local

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image \
  --severity CRITICAL,HIGH \
  --ignore-unfixed \
  sero-node:hardening-local
```

Write results to `docs/security/scans/pr-177-sero-node/after-analysis.md`.

### A7. Runtime validation after image changes

Run automated tests:

```bash
pnpm --filter @sero/desktop exec vitest run \
  electron/__tests__/features/workspace/runtime \
  electron/__tests__/features/container

pnpm --filter @sero/desktop typecheck
pnpm typecheck
```

Run direct Docker smoke:

```bash
docker run --rm sero-node:hardening-local sh -lc '
  node --version && pnpm --version && git --version && python3 --version
'
```

Run in-app smoke on macOS Docker runtime:

- Create/open workspace with Docker backend.
- Shell command can write/read files.
- Git works.
- LSP still initializes.
- Managed dev-server smoke works.
- Browser automation works if still included in the default image, or works through the browser image/lazy path if split.

### A8. Docker hardening acceptance criteria

- Baseline reports are checked in or attached to PR as artifacts.
- Image size reduction is documented.
- Fixable critical/high vulnerabilities are eliminated or explicitly justified.
- No loss of required runtime functionality.
- CI has at least one repeatable image scan or documented command.

---

## Track B — Castlabs Electron Upgrade

### B1. Baseline current Electron behavior

Record current version and supported artifact limitations:

```bash
pnpm --dir apps/desktop exec electron --version
node -p "process.platform + ' ' + process.arch"
```

Document current package:

```json
"electron": "github:castlabs/electron-releases#v33.4.11+wvcus"
```

Known issue: Castlabs `v33.4.11+wvcus` is old and caused Linux ARM/Rosetta install friction during validation.

### B2. Upgrade spike branch

Use a separate branch or staged commit:

```bash
git checkout -b spike/electron-42
pnpm --filter @sero/desktop add electron@github:castlabs/electron-releases#v42.0.0+wvcus
pnpm install --force --config.optional=true
```

If latest changes while working, use the latest stable Castlabs tag and record the exact tag.

### B3. Compile and typecheck

```bash
pnpm --filter @sero/desktop typecheck
pnpm --dir apps/desktop build:electron
pnpm --dir apps/desktop exec electron --version
```

Fix Electron API/type breakage without weakening type safety.

### B4. Native module validation

Run native rebuild path on platforms where available:

```bash
pnpm rebuild
pnpm rebuild electron
pnpm rebuild node-pty better-sqlite3
```

Then validate:

- Terminal creation works.
- Memory/database features work.
- No `node-pty` or `better-sqlite3` ABI mismatch.

### B5. Desktop smoke matrix

Run in-app smoke for Electron 42 on available platforms:

- macOS Apple Silicon:
  - App launches from source.
  - Onboarding/default model dialog works.
  - Existing profile opens.
  - Agent chat starts.
  - Docker runtime works.
  - Apple Container runtime works.
  - Browser automation works.
- Windows physical x86 laptop when available:
  - App launches from source.
  - Docker/Podman local engine works and bind-mounts Windows paths.
  - Agent session opens with Docker/Podman backend.
  - Browser automation works.
- Linux x64 physical/VM when available:
  - App launches from source.
  - Docker runtime works.
  - Browser automation works.

### B6. Packaging smoke

Check Electron Builder config with upgraded Electron:

```bash
pnpm --dir apps/desktop pack
```

At minimum validate macOS packaging locally. Validate Windows/Linux packaging when the new test laptop is available.

### B7. Electron upgrade acceptance criteria

- `pnpm --filter @sero/desktop typecheck` passes.
- `pnpm typecheck` passes.
- Desktop app launches on macOS.
- Runtime smoke still passes on macOS Docker/Apple/Host.
- No preload/IPC regressions.
- Known platform limitations are documented.

---

## Final PR #177 Release Gate

PR #177 should not be released until:

1. Docker image baseline scan is captured and summarized.
2. Docker image hardening changes are implemented or a justified minimal-risk subset is merged.
3. Hardened image is rebuilt and smoke-tested.
4. Electron upgrade is either merged after validation or explicitly deferred with a documented blocker.
5. Full test/typecheck pass:

```bash
pnpm --filter @sero/desktop typecheck
pnpm typecheck
pnpm --filter @sero/desktop exec vitest run \
  electron/__tests__/features/workspace/runtime \
  electron/__tests__/features/container \
  electron/__tests__/features/onboarding \
  src/components/profiles
```

6. PR body is updated with:
   - Docker image size before/after.
   - Vulnerability summary before/after.
   - Electron version decision.
   - Platform smoke matrix and known blockers.
