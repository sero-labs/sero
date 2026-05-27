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

### 1. macOS — signing/notarization DONE; only the `zip` target remains
- **Signing + notarization is now in place** (commit f9cd8f4 / #192). `build-release.sh`
  auto-enables Developer ID signing when `CSC_LINK` is set and notarizes via
  electron-builder's native notarytool (`-c.mac.notarize=true`) when `APPLE_ID` /
  `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` are present; `release.yml` passes
  those secrets to the macOS build. This was the hard prerequisite (Gap 2) — Squirrel
  validates the signature or the update silently fails — and it's resolved.
- **Remaining blocker:** the mac target is still **`dmg` only**. Squirrel.Mac can only
  update from a **`.zip`**, not a dmg, so add a `zip` target alongside `dmg` (ship the
  dmg for first install, the zip for the updater). `build-release.sh:83` already lists
  `release/*.zip` for mac, so the artifact glob is ready — nothing produces the zip yet.
  Once the zip target is added, macOS silent auto-update is unblocked.

### 2. Linux — `.deb` CAN self-update (revises earlier assumption)
Current electron-updater (6.x) ships a `DebUpdater` (plus `RpmUpdater` /
`PacmanUpdater`), added in electron-builder PR #7060 — so **`.deb` auto-update is
supported natively and AppImage is not required**. The updater reads
`latest-linux.yml` (already published by the pipeline), downloads the new `.deb`,
and installs it via a GUI privilege prompt (pkexec / gksudo / kdesudo) running
`dpkg -i … || apt-get install -f -y`.

This is the right fit for the build-time / storage goals: keeping `deb`-only adds
**no** extra artifacts and reuses the package already built. AppImage was removed in
706ee3e for exactly those reasons and does **not** need to come back to enable
auto-update.

Trade-offs vs. AppImage:
- **deb-only (recommended):** no extra artifacts. Cost — the update shows a
  sudo/password prompt (not a silent swap), needs a graphical pkexec present, and
  only covers Debian/Ubuntu derivatives (consistent with shipping `deb` anyway).
- **AppImage:** seamless silent update, distro-agnostic — but adds a full packaged
  artifact per arch (the build-time/storage cost just removed) and isn't
  installable like a deb (no apt / menu integration), the original friction.

Caveat: DebUpdater has had install-command quoting bugs on some Ubuntu versions
(issue #8395). Pin a recent `electron-updater` and smoke-test an actual
deb→deb update on a real Ubuntu box before relying on it.

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
2. **macOS** — signing/notarization already done (#192); just add a `zip` target to
   unblock Squirrel.Mac updates.
3. **Linux** — `.deb` auto-update via `DebUpdater` works with the package already
   built; smoke-test on Ubuntu. Reinstate AppImage only if a silent (no-sudo)
   update UX is required.

## Suggested first PR scope

Cross-platform plumbing + Windows (unblocked today):
- `publish` stanza in `electron-builder.yml`
- `features/updater/` module + IPC
- channel / prerelease config
- update-ready UI (toast / Admin or Doctor panel)

Follow-ups: macOS `zip` target (signing/notarization already landed in #192); Linux
deb→deb update smoke-test on Ubuntu (optional AppImage only if a silent, no-sudo
update UX is needed).
