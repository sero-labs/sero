# Desktop Auto-Update — Analysis & Recommendation

Analysis of how to add automatic updates to the Sero desktop app via GitHub
Releases. Builds on `desktop-release-distribution.md` (Gap 1), confirming its
direction against the current code and surfacing three blockers that plan
under-specifies.

## Current state

- **Stack:** Electron 41 + `electron-builder` 25, in the pnpm monorepo at `apps/desktop`.
- **Pipeline:** `.github/workflows/release.yml` builds a matrix (macOS arm64,
  Linux x64/arm64, Windows x64) and publishes a GitHub Release. The upload step
  already includes `*.yml` and `*.blockmap` (`release.yml:188-194`) — these are
  the update-feed metadata (`latest-mac.yml`, `latest-linux.yml`, `latest.yml`)
  and differential-download maps `electron-updater` consumes. The release format
  is already ~90% compatible.
- **No updater code exists** — no `electron-updater` / `autoUpdater` references
  anywhere, and `electron-builder.yml` has **no `publish` stanza**.
- **Versioning:** `0.1.1-beta` (SemVer prerelease); public beta.

## Recommended approach: `electron-updater` + GitHub provider

Standard, lowest-friction path for an electron-builder app, and the pipeline
already emits the right artifacts. Add a `publish` stanza, wire `autoUpdater`
into the main process after `app.whenReady()` (`app-main.ts:293`), and expose
IPC so the renderer can show "update ready — restart".

```yaml
# electron-builder.yml
publish:
  provider: github
  owner: sero-labs
  repo: sero
```

Wiring is small:
- `apps/desktop/electron/features/updater/updater.ts` — init `autoUpdater`,
  handle `update-available` / `update-downloaded` / `error`, set channel /
  prerelease.
- An IPC channel pair so the renderer can show update state and trigger restart.
- `initUpdater()` call after `createWindow()` in `app-main.ts`.

**Suggested policy:** silent background download, prompt on next launch / via a
toast ("Restart to update" / "Later").

## Blockers / constraints to decide first

### 1. macOS — needs a `zip` target AND signing (hard blocker)
- Mac target is **`dmg` only** (`electron-builder.yml:57-59`). Squirrel.Mac
  (electron-updater on macOS) can only update from a **`.zip`**, not a dmg. Ship
  the dmg for first install *and* build a zip for the updater. (`build-release.sh:83`
  already lists `release/*.zip` for mac, but nothing produces it yet.)
- macOS auto-update **requires a signed + notarized build** — Squirrel validates
  the signature or the update silently fails. This is Gap 2 in the distribution
  plan and is a prerequisite, not a parallel task. Until an Apple Developer ID
  cert is in CI, fall back to a "download update" link on macOS.

### 2. Linux — `.deb` cannot self-update via electron-updater
electron-updater supports only **AppImage** (and pacman) for Linux auto-update,
**not `.deb`**. Linux target is `deb` only. Options: add an `AppImage` target for
the self-updating path (keep `.deb` for apt-style install), or accept that Linux
updates stay manual / handled by an apt repo. This is the largest gap between the
distribution plan's "all platforms" claim and reality.

### 3. Releases are drafts + version is a `-beta` prerelease
- The workflow creates releases as **draft by default** (`release.yml:217`).
  electron-updater's GitHub provider reads the *published* latest release — it
  will not see drafts. Releases must be published (non-draft) for the feed to
  resolve.
- `0.1.1-beta` is a SemVer prerelease. The updater ignores prereleases unless
  `allowPrerelease: true` is set or a `beta` channel is run. Shipping a public
  beta means explicit channel handling so beta users update to betas without
  betas leaking onto a future stable channel.

## Suggested rollout order

1. **Windows first** — NSIS supports electron-updater out of the box; no signing
   strictly required (only SmartScreen warnings). Fastest end-to-end proof.
2. **macOS** — add `zip` target, then gate on signing/notarization (Gap 2).
3. **Linux** — decide AppImage vs. manual; if AppImage, add the target.

## Suggested first PR scope

Cross-platform plumbing + Windows (unblocked today):
- `publish` stanza in `electron-builder.yml`
- `features/updater/` module + IPC
- channel / prerelease config
- update-ready UI (toast / Admin or Doctor panel)

Follow-ups: macOS zip target + signing/notarization; Linux AppImage decision.
