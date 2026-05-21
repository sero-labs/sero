# Browser-pack artifact release runbook

This runbook explains exactly how to create and publish the browser-pack artifacts required for host browser automation.

A **browser pack** is a `.tar.gz` archive containing the pinned Chromium, ffmpeg, and `agent-browser` files for one operating system and CPU architecture. These archives are too large to commit to git, so we publish them as GitHub Release assets and commit only their SHA/size metadata.

## Required artifacts

PR #185 requires these four release-target artifacts, matching [`host-mode-support.md`](./host-mode-support.md):

| Machine you must use to build it | Browser-pack asset | Manifest artifact ID | Metadata sidecar asset | Current checked-in state |
| --- | --- | --- | --- | --- |
| Apple Silicon Mac | `mac-arm64.tar.gz` | `browser-darwin-arm64` | `mac-arm64.json` | Published/available |
| Linux x64 machine | `linux-x64.tar.gz` | `browser-linux-x64` | `linux-x64.json` | Pending; non-installable release blocker |
| Linux arm64 machine | `linux-arm64.tar.gz` | `browser-linux-arm64` | `linux-arm64.json` | Pending; non-installable release blocker |
| Windows x64 machine using Git Bash | `win-x64.tar.gz` | `browser-win32-x64` | `win-x64.json` | Pending; non-installable release blocker |

macOS on Intel CPUs is explicitly unsupported. Windows arm64 is intentionally not part of this release and remains a possible future target. Pending manifest entries are not supported installs; publish the GitHub Release asset, merge the sidecar metadata, and pass `browser-pack:verify-published` before claiming install support. Locally served artifacts via `SERO_BROWSER_PACK_BASE_URL` are developer diagnostics only.

**Important:** do not try to build another platform's artifact from your current machine. The build script intentionally blocks that because Playwright downloads browser binaries for the current OS/architecture only.

## Recommended path — run the native builder workflow

Use the `Browser Pack Artifacts` workflow when the native runners are available. It builds each required pack on its matching runner, uploads the archive and receipt JSON to the GitHub Release, downloads the receipts, merges `generated-artifacts.json`, and verifies every published artifact.

```bash
gh workflow run browser-pack-artifacts.yml \
  --ref feat/enhanced-host-mode \
  -f commit_metadata=false
```

Set `commit_metadata=true` if you want the workflow to commit the generated metadata back to the branch after verification:

```bash
gh workflow run browser-pack-artifacts.yml \
  --ref feat/enhanced-host-mode \
  -f commit_metadata=true
```

If `commit_metadata=false`, download the workflow artifact named `browser-pack-generated-artifacts` and commit the contained `generated-artifacts.json` manually.

The manual steps below are only needed when running outside the workflow or debugging a single platform.

## Where artifacts are uploaded

All artifacts go to this GitHub Release:

```txt
Repository: sero-labs/sero
Release tag: browser-pack-2026-05-16
```

Final public URLs must look like this:

```txt
https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16/<artifact-file>
```

For example:

```txt
https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16/linux-x64.tar.gz
```

## Step 0 — prerequisites on every build machine

Install or verify:

1. Git
2. Node 22
3. pnpm
4. GitHub CLI: `gh`
5. A `gh` login with write access to `sero-labs/sero`

Check auth:

```bash
gh auth status
```

If this does not show access to `github.com`, login first:

```bash
gh auth login
```

## Step 1 — create the GitHub Release once

Run this once from any machine with GitHub write access:

```bash
gh release create browser-pack-2026-05-16 \
  --repo sero-labs/sero \
  --title "Sero Browser Pack 2026-05-16" \
  --notes "Pinned host browser automation packs for Sero. Integrity is enforced by generated-artifacts.json SHA-256 metadata." \
  --prerelease
```

If it says the release already exists, that is fine. Continue.

## Step 2 — build one artifact on its matching machine

On each required machine, run the same commands.

First, get the branch and dependencies:

```bash
git clone git@github.com:sero-labs/sero.git
cd sero
git checkout feat/enhanced-host-mode
git pull
pnpm install --frozen-lockfile
```

If the repo is already cloned, start at `cd sero`.

Then build the current machine's browser pack:

```bash
pnpm --filter @sero/desktop browser-pack:build -- \
  --metadata-out dist/browser-pack/2026-05-16
```

The command automatically detects the current OS/architecture and writes two files under:

```txt
apps/desktop/dist/browser-pack/2026-05-16/
```

Example on Linux x64:

```txt
apps/desktop/dist/browser-pack/2026-05-16/linux-x64.tar.gz
apps/desktop/dist/browser-pack/2026-05-16/linux-x64.json
```

## Step 3 — upload the artifact and sidecar from that machine

Upload both files created in Step 2:

- the `.tar.gz` installable browser pack
- the small `.json` sidecar with the SHA-256 and size metadata needed for `generated-artifacts.json`

Use the correct command for the current machine:

### Apple Silicon Mac

```bash
gh release upload browser-pack-2026-05-16 \
  apps/desktop/dist/browser-pack/2026-05-16/mac-arm64.tar.gz \
  apps/desktop/dist/browser-pack/2026-05-16/mac-arm64.json \
  --repo sero-labs/sero \
  --clobber
```

### Linux x64

```bash
gh release upload browser-pack-2026-05-16 \
  apps/desktop/dist/browser-pack/2026-05-16/linux-x64.tar.gz \
  apps/desktop/dist/browser-pack/2026-05-16/linux-x64.json \
  --repo sero-labs/sero \
  --clobber
```

### Linux arm64

```bash
gh release upload browser-pack-2026-05-16 \
  apps/desktop/dist/browser-pack/2026-05-16/linux-arm64.tar.gz \
  apps/desktop/dist/browser-pack/2026-05-16/linux-arm64.json \
  --repo sero-labs/sero \
  --clobber
```

### Windows x64 Git Bash

Run from Git Bash, not PowerShell:

```bash
gh release upload browser-pack-2026-05-16 \
  apps/desktop/dist/browser-pack/2026-05-16/win-x64.tar.gz \
  apps/desktop/dist/browser-pack/2026-05-16/win-x64.json \
  --repo sero-labs/sero \
  --clobber
```

## Step 4 — download all sidecar JSON files onto one machine

After all four machines upload their `.json` sidecars, download them into one checkout:

```bash
mkdir -p apps/desktop/dist/browser-pack/2026-05-16
for receipt in mac-arm64.json linux-x64.json linux-arm64.json win-x64.json; do
  gh release download browser-pack-2026-05-16 \
    --repo sero-labs/sero \
    --pattern "$receipt" \
    --dir apps/desktop/dist/browser-pack/2026-05-16 \
    --clobber
done
```

This should create:

```txt
apps/desktop/dist/browser-pack/2026-05-16/mac-arm64.json
apps/desktop/dist/browser-pack/2026-05-16/linux-x64.json
apps/desktop/dist/browser-pack/2026-05-16/linux-arm64.json
apps/desktop/dist/browser-pack/2026-05-16/win-x64.json
```

Do not commit these sidecar files.

## Step 5 — merge sidecars into committed metadata

From the checkout that has all four sidecars, run:

```bash
pnpm --filter @sero/desktop browser-pack:merge-metadata -- \
  --sidecar-dir dist/browser-pack/2026-05-16
```

This updates exactly this committed metadata file:

```txt
apps/desktop/electron/features/workspace/runtime/browser-pack/generated-artifacts.json
```

## Step 6 — verify the uploaded files and metadata

Run:

```bash
pnpm --filter @sero/desktop browser-pack:verify-published
pnpm --filter @sero/desktop verify:host-mode-release
```

Both commands must pass.

If `browser-pack:verify-published` fails, the error will name the missing or mismatched artifact. Fix that artifact, upload it again with `--clobber`, re-merge metadata if the SHA/size changed, then rerun both commands.

## Step 7 — commit the metadata

Only commit this file:

```txt
apps/desktop/electron/features/workspace/runtime/browser-pack/generated-artifacts.json
```

Do not commit anything under:

```txt
apps/desktop/dist/browser-pack/
```

Commit command:

```bash
git add apps/desktop/electron/features/workspace/runtime/browser-pack/generated-artifacts.json
git commit -m "chore(desktop): publish browser pack metadata"
git push origin feat/enhanced-host-mode
```

## Step 8 — final validation

Run:

```bash
pnpm typecheck
pnpm test
pnpm --filter @sero/desktop browser-pack:verify-published
pnpm --filter @sero/desktop verify:host-mode-release
```

Then run the release workflow:

```bash
gh workflow run host-mode-release.yml --ref feat/enhanced-host-mode
```

The PR can only claim real multi-platform host browser automation after these checks pass.

## Troubleshooting

### The build says it cannot build this platform

You are on the wrong machine. Use a machine matching the required artifact row above.

### The upload says the asset already exists

Use `--clobber`, as shown above.

### Verification reports a SHA mismatch

The uploaded archive does not match `generated-artifacts.json`. Re-upload the correct archive, rerun `browser-pack:merge-metadata`, and verify again.

### Verification reports HTTP 404

The asset is missing from the GitHub Release or has the wrong filename. Upload the exact expected `.tar.gz` filename from the table.
