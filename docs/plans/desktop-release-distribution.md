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

## Gap 2 — macOS code signing and notarization

**Current state:** `afterSign: null` in `electron-builder.yml`. `CSC_LINK`/`CSC_KEY_PASSWORD` env vars are documented but no CI secrets are configured. Unsigned `.app` bundles trigger Gatekeeper on macOS 15+ and require users to `xattr -dr com.apple.quarantine` or use "Open Anyway".

**What's needed:**

- An Apple Developer ID Application certificate exported as `.p12`.
- Apple notarization credentials (Apple ID + app-specific password + Team ID).
- CI secrets configured in the `sero-labs/sero` repository.
- `afterSign` re-enabled in `electron-builder.yml` for the release workflow.

**Steps:**

- [ ] Export Developer ID Application certificate from Keychain as `.p12`. Base64-encode it:
  `base64 -i DeveloperID.p12 | pbcopy`
- [ ] Add GitHub Actions repository secrets:
  - `CSC_LINK` — base64-encoded `.p12`
  - `CSC_KEY_PASSWORD` — certificate password
  - `APPLE_ID` — Apple ID used for notarization
  - `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password for that Apple ID
  - `APPLE_TEAM_ID` — 10-character team ID
- [ ] In `release.yml`, pass these secrets as env vars to the macOS build step.
- [ ] Set `afterSign` to the notarization script. electron-builder supports `afterSign: build/notarize.js`. A minimal notarize script:

  ```js
  // build/notarize.js
  const { notarize } = require('@electron/notarize');
  exports.default = async (context) => {
    if (context.electronPlatformName !== 'darwin') return;
    await notarize({
      tool: 'notarytool',
      appBundleId: 'app.sero',
      appPath: context.appOutDir + '/Sero.app',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
  };
  ```

- [ ] Add `@electron/notarize` as a dev dependency in `apps/desktop/`.
- [ ] Verify entitlements file `build/entitlements.mac.plist` includes `com.apple.security.cs.allow-jit` if needed for JIT (node-pty uses a pseudo-TTY, usually not required).
- [ ] Test a signed + notarized build before wiring into CI by running `build-release.sh --sign` locally with the cert in Keychain.

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
