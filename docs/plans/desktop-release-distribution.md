# Desktop Release Distribution Plan

Gaps remaining before Sero can ship real, self-updating desktop releases on all supported platforms. The packaging and GitHub Release pipeline itself (electron-builder, build-release.sh, release.yml) is complete and produces correct artifacts — this plan covers the remaining distribution layer on top of it.

## Gap 1 — No auto-update

**Current state:** `electron-updater` is not installed. `electron-builder.yml` has no `publish` stanza. Users must manually download new versions.

**What's needed:**

- `electron-updater` wired into the Electron main process.
- A `publish` target in `electron-builder.yml` pointing to GitHub Releases.
- Update checking on startup and on a periodic interval (or on user request from the Doctor / Admin panel).

**Steps:**

- [ ] Add `electron-updater` to `apps/desktop/package.json` dependencies.
- [ ] Add `publish` stanza to `electron-builder.yml`:

  ```yaml
  publish:
    provider: github
    owner: sero-labs
    repo: sero
  ```

- [ ] Create `apps/desktop/electron/features/updater/` with:
  - `updater.ts` — initialise `autoUpdater`, configure feed URL, handle events (`update-available`, `update-downloaded`, `error`).
  - Expose IPC channels so the renderer can show update state (progress, prompt to restart).
- [ ] Wire `initUpdater()` into `app-main.ts` after the app `ready` event.
- [ ] Add update status to the Doctor / Admin UI (show current version, available version, download progress).
- [ ] On macOS, auto-update requires a code-signed build (Gap 2). For unsigned builds, surface a "download update" link instead of silent install.
- [ ] Decide on update policy: silent background download + prompt to restart, or explicit user-initiated check. Recommend: download silently, prompt on restart with "Restart to update" / "Later".

---

## Gap 2 — macOS code signing and notarization — ✅ DONE

**Current state:** macOS releases are signed with a Developer ID Application certificate and notarized by Apple (Team `NLUPAVUUZ8`), so the DMG opens on double-click with no Gatekeeper prompt. CI secrets are configured in `sero-labs/sero`; the build auto-signs+notarizes when they are present and falls back to unsigned ad-hoc otherwise. Verified end-to-end (`spctl -a` → `accepted` / `source=Notarized Developer ID`) and shipped from `v0.1.2-beta.0`.

The unsigned ad-hoc path (below) remains as the fallback for builds without the signing secrets (e.g. local `--dir` builds).

**Done — ad-hoc signing (no Apple account):**

- [x] Keep unsigned macOS releases installable by ad-hoc-signing the app bundle before the DMG is created (`scripts/after-pack.mjs`, gated on `CSC_IDENTITY_AUTO_DISCOVERY=false`). A release-workflow `codesign --verify` gate guards the seal. Users still need the first-launch **System Settings → Privacy & Security → Open Anyway** approval because the app is not notarized.

**Done — signing + notarization wiring (activates when secrets are present):**

The build is wired for full Developer ID signing + notarization using electron-builder 25's **native** notarize support (it bundles `@electron/notarize` and handles sign → submit → staple in one pass — no custom `afterSign` script or extra dependency needed; `afterSign` stays `null`).

- [x] `build-release.sh` auto-enables Developer ID signing for mac when `CSC_LINK` is set, and passes `-c.mac.notarize=true` to notarize (electron-builder 25 reads `APPLE_TEAM_ID` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` from the environment; the `notarize.teamId` form is rejected). With no creds it falls back to the unsigned ad-hoc flow; with a cert but no notary creds it signs only. If notary creds are partially set, the build fails loudly rather than shipping a non-notarized app.
- [x] `release.yml` passes `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` to the build step, scoped to macOS. They resolve to empty until configured, so the workflow keeps producing unsigned ad-hoc builds with no change in behavior.
- [x] The ad-hoc path auto-disables once signing is on: setting `CSC_LINK` leaves `CSC_IDENTITY_AUTO_DISCOVERY` unset, so `after-pack.mjs` bails out and electron-builder signs with hardened runtime. No conflict to unwind.
- [x] Entitlements (`build/entitlements.mac.plist`) already include `allow-jit`, `allow-unsigned-executable-memory`, and `disable-library-validation` — all permitted under notarization.

**Owner actions — completed:**

- [x] Enrolled in the Apple Developer Program (individual; Team `NLUPAVUUZ8`).
- [x] Created a **Developer ID Application** certificate and exported it (cert + private key) from Keychain as `.p12`.
- [x] Created an app-specific password for notarytool.
- [x] Added GitHub Actions repository secrets: `CSC_LINK` (base64 `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- [x] Verified locally and in CI: `spctl -a -vvv -t exec` → `accepted` / `source=Notarized Developer ID`; `xcrun stapler validate` passes on the CI artifact.
- [x] Simplified the install docs — the DMG opens on double-click; the "Open Anyway" instructions were removed.

---

## Gap 3 — Windows code signing

**Current state:** NSIS installer and ZIP are unsigned. Windows SmartScreen flags unknown publishers and shows "Windows protected your PC" to users.

**What's needed:**

- An EV (Extended Validation) code signing certificate or a standard OV certificate from a CA (DigiCert, Sectigo, etc.). EV is required for immediate SmartScreen reputation; OV certificates build reputation over time.
- GitHub Actions secret with the certificate.

**Steps:**

- [ ] Obtain an EV code signing certificate (recommended: DigiCert or Sectigo via reseller).
- [ ] For EV certs stored on a hardware token: use a cloud HSM (DigiCert KeyLocker, SSL.com eSigner) that supports CI signing without a physical token.
- [ ] Add GitHub Actions secrets for the signing provider's CI credentials.
- [ ] Configure `electron-builder.yml` Windows signing:

  ```yaml
  win:
    certificateSubjectName: "Sero Labs"
    signingHashAlgorithms: ["sha256"]
    # For cloud HSM / Azure Key Vault approach:
    sign: build/win-sign.js
  ```

- [ ] Alternatively, use `AzureSignTool` or the signing provider's GitHub Action in the release workflow.
- [ ] Smoke-test the signed installer on a fresh Windows VM to confirm SmartScreen passes.

**Note:** Until an EV cert is obtained, include a prominent note in release notes that SmartScreen will warn on first install and explain how to proceed. This is a known friction point for new publishers.

---

## Gap 4 — Doctor messaging for non-macOS platforms

**Current state:** `system.ts` returns `status: 'warn'` with message "Sero v1 is designed for macOS. Detected ${platform}" for any non-macOS platform. Linux and Windows are first-class targets.

**Steps:**

- [ ] In `electron/features/doctor/engine/checks/system.ts`, change `platformCheck` to return `pass` on `linux` and `win32`:

  ```ts
  if (['darwin', 'linux', 'win32'].includes(platform)) {
    return makeResult({ status: 'pass', message: `${platform} detected.`, ... });
  }
  return makeResult({ status: 'warn', message: `Unsupported platform: ${platform}.`, ... });
  ```

- [ ] Review other doctor messages for similar macOS-centric language.

---

## Gap 5 — Linux RPM target

**Current state:** Linux builds produce `.deb` packages for x64 and arm64. Fedora, RHEL, openSUSE, and other RPM-based distros are excluded from managed package install.

**What's needed:**

- `.rpm` target for Linux x64 (and optionally arm64 when `fpm` supports it).
- `fpm` is required by electron-builder for RPM; the x64 `.deb` path uses it, while arm64 `.deb` is built with `dpkg-deb` because electron-builder's bundled `fpm` binary is x64-only.

**Steps:**

- [ ] Add `rpm` to the Linux targets in `electron-builder.yml`:

  ```yaml
  linux:
    target:
      - deb
      - rpm
  ```

- [ ] `fpm` gem is available on `ubuntu-24.04` runners. Verify it produces a valid `.rpm` (electron-builder handles this transparently alongside x64 `.deb`).
- [ ] RPM is only feasible on Linux x64 unless we add a manual `rpmbuild` path equivalent to the arm64 `dpkg-deb` path.
- [ ] Test the `.rpm` on a Fedora container: `podman run --rm -v ./release:/r fedora:latest rpm -i /r/Sero-*.rpm`.

---

## Suggested implementation order

| Priority | Gap | Effort | Impact |
|---|---|---|---|
| 1 | Doctor messaging fix (Gap 4) | Trivial | User confidence on Linux/Windows |
| 2 | Auto-update (Gap 1) | Medium | Retention / upgrade path |
| 3 | macOS signing + notarization (Gap 2) | Medium | Removes Gatekeeper friction |
| 4 | Linux RPM (Gap 5) | Low | Fedora/RHEL reach |
| 5 | Windows code signing (Gap 3) | High (cost) | Removes SmartScreen friction |

Gap 4 is a prerequisite for clear release messaging. Gap 2 (signing) is a prerequisite for Gap 1 (auto-update) working silently on macOS.
