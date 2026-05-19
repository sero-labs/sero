# Browser-pack artifact release steps

Sero host browser automation is release-ready only when every release-supported browser pack is built on a matching native host, uploaded to GitHub Releases, verified by SHA-256, and committed into `generated-artifacts.json`.

Release tag:

```txt
browser-pack-2026-05-16
```

Asset base URL:

```txt
https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16
```

## One-time release setup

Run once from any machine with `gh` write access to `sero-labs/sero`:

```bash
gh release create browser-pack-2026-05-16 \
  --repo sero-labs/sero \
  --title "Sero Browser Pack 2026-05-16" \
  --notes "Pinned host browser automation packs for Sero. Integrity is enforced by generated-artifacts.json SHA-256 metadata." \
  --prerelease
```

If the release already exists, skip this step.

## Build/upload on each native platform

Run these commands on the matching host. Do not cross-build browser packs; Playwright installs browser binaries for the current OS/arch.

```bash
git checkout feat/enhanced-host-mode
git pull
pnpm install --frozen-lockfile

pnpm --filter @sero/desktop browser-pack:build -- \
  --metadata-out dist/browser-pack/2026-05-16

gh release upload browser-pack-2026-05-16 \
  apps/desktop/dist/browser-pack/2026-05-16/<slug>.tar.gz \
  --repo sero-labs/sero \
  --clobber
```

Replace `<slug>` with the slug for that host:

| Native host | Required asset | Sidecar produced |
| --- | --- | --- |
| macOS arm64 | `mac-arm64.tar.gz` | `mac-arm64.json` |
| macOS x64 / Intel Mac | `mac-x64.tar.gz` | `mac-x64.json` |
| Linux x64 | `linux-x64.tar.gz` | `linux-x64.json` |
| Linux arm64 | `linux-arm64.tar.gz` | `linux-arm64.json` |
| Windows x64 Git Bash | `win-x64.tar.gz` | `win-x64.json` |

Windows arm64 is intentionally future/unsupported for this release matrix.

## Merge metadata after all sidecars are collected

Copy all sidecar JSON files into:

```txt
apps/desktop/dist/browser-pack/2026-05-16/
```

Then run from the repo root:

```bash
pnpm --filter @sero/desktop browser-pack:merge-metadata -- \
  --sidecar-dir dist/browser-pack/2026-05-16

pnpm --filter @sero/desktop browser-pack:verify-published
pnpm --filter @sero/desktop verify:host-mode-release
```

If both verification commands pass, commit:

```txt
apps/desktop/electron/features/workspace/runtime/browser-pack/generated-artifacts.json
```

## Final validation

Before claiming release support, run:

```bash
pnpm typecheck
pnpm test
gh workflow run host-mode-release.yml --ref feat/enhanced-host-mode
```

The `host-mode-release` workflow is the platform gate for macOS, Linux, and Windows host-mode smoke plus packaged artifacts.
