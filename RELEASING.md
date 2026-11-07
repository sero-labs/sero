# Release Runbook

Operational checklist for cutting a Sero desktop release. Sero 1.0 ships through
a release candidate first: `1.0.0-rc.N` → `1.0.0`.

Every item below is a gate unless it is marked **(advisory)**. Unchecked gates
block the tag.

Related: [`CHANGELOG.md`](./CHANGELOG.md), [`apps/docs-site/docs/reference/support-scope.md`](./apps/docs-site/docs/reference/support-scope.md),
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 1. Pre-flight: the evidence must be green

A release is only as trustworthy as the last full run of its gates. Run these by
hand on the commit you intend to tag, and record the run IDs in the release PR.

- [ ] `E2E Contract` is green on all three runners (Ubuntu, macOS, Windows).
      Manual dispatch only.
      `gh workflow run e2e-contract.yml`
- [ ] `E2E Agent` is green at `mode=full`.
      Manual dispatch only.
      `gh workflow run e2e-agent.yml -f mode=full`
- [ ] `E2E Workflow` is green for the target runtime the release claims.
      `gh workflow run e2e-workflow.yml -f os=macos -f runtime=host`
- [ ] `Tool Check` is green on every target the release supports. This is the
      "every agent tool for real" gate (issue #626) and it also runs by hand.
      `gh workflow run tool-check.yml -f target=all`
- [ ] `Test` is green on `main` at the release commit
      (`pnpm typecheck && pnpm build && pnpm test && pnpm e2e:contract` locally,
      or the CI job of the same name).
- [ ] `React Doctor` has no new findings on the release commit.
- [ ] No open `v1.0` labelled issue that names user-visible breakage.
      `gh issue list --label v1.0 --state open`

### Historical context worth knowing

Both `E2E Contract` and `E2E Agent` were nightly until they were moved to manual
dispatch, after ten consecutive scheduled failures from 2026-10-28. The Windows
contract job had also been failing at `actions/checkout` before any test ran, so
Windows had no contract coverage at all during that window. Treat a Windows
contract result as newly-established evidence, not as a formality.

---

## 2. Release acceptance: the packaged journey

- [ ] Issue #635 exists as a passing test: a **packaged** build installs, runs a
      real task to a result, and survives a recovery path. Nothing else in the
      gate list proves a shipped artifact works — the rest runs from a dev tree.

If #635 is not done, an RC validates a development build, not a release. Do not
tag before this passes.

---

## 3. Release mechanics

### 3.1 Version and channel

The release script syncs only the root and `apps/desktop` versions
(`scripts/sync-release-package-version.mjs`).

- [ ] Decide the channel: `1.0.0-rc.N` (candidate) or `1.0.0` (stable).
- [ ] `release:rc` scripts exist in `package.json`
      (`release-it --preRelease=rc` plus a dry variant). They do not yet — add
      them next to `release:beta` / `release:stable`.
- [ ] Decide whether the published packages (`@sero-ai/app-runtime`,
      `@sero-ai/common`, `@sero-ai/extension-runtime`, `@sero-ai/plugin-vite`,
      `@sero-ai/ui`) move with 1.0 or stay on their independent train. They are
      the plugin-author contract, so 1.0's stability claim depends on the answer.
      Whatever you choose, bump each package you touched in the same PR.

```bash
pnpm release:rc:dry        # inspect the changelog and bump first
pnpm release:rc            # tag and push v1.0.0-rc.1
```

### 3.2 Updater channel policy

`apps/desktop/electron/features/updater/updater.ts:91` hardcodes
`autoUpdater.allowPrerelease = true`, with a comment saying to flip it off for a
stable channel.

- [ ] Replace the hardcoded `true` with a value derived from
      `app.getVersion()`'s prerelease tag, so an RC accepts RC updates and a
      stable build does not silently install a later prerelease. Do this
      **before** the RC, because fixing it at stable is a code change during a
      release window.

### 3.3 Externally published artifacts

The release workflow verifies these before it builds anything, so a missing
publication fails the release rather than shipping a broken app.

- [ ] Browser pack published for the release version
      (`pnpm --filter @sero/desktop browser-pack:verify-published`).
- [ ] Core toolchains published
      (`pnpm --filter @sero/desktop toolchain:verify-published`).
- [ ] Container image rebuilt if `apps/desktop/images/Dockerfile.sero-node` or
      its installed tools changed since the last release. Rebuild
      `sero-node:latest` and recreate affected workspace containers.

---

## 4. Signing and trust

All five Apple secrets are configured in the repository (`CSC_LINK`,
`CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`),
and `apps/desktop/scripts/build-release.sh:366-386` signs with Developer ID and
notarizes when the set is complete.

The gap is that nothing **fails** a release where signing silently fell back to
the ad-hoc path in `apps/desktop/scripts/after-pack.mjs`. The existing
`codesign --verify --deep --strict` step in `release.yml` passes on an ad-hoc
bundle too.

- [ ] Add a hard assertion to the macOS job in `release.yml` that fails unless
      the artifact is Developer ID signed, hardened runtime is on, Gatekeeper
      accepts it, and the notarization ticket is stapled:

```bash
codesign -dv --verbose=4 "$app_path" 2>&1 | grep -q "Developer ID Application"
codesign -d --verbose=2 "$app_path" 2>&1 | grep -q "flags=.*runtime"
spctl -a -t exec -vvv "$app_path"
xcrun stapler validate "$app_path"
```

- [ ] Confirm the RC artifact carries a valid ticket by installing it on a clean
      Mac profile and launching it with Gatekeeper active.

### Windows and Linux

- [ ] Decide explicitly whether 1.0 ships an **unsigned** Windows NSIS
      installer. No Windows signing secret exists, so SmartScreen will warn
      users. Signing, or documenting the warning, is a launch decision.
- [ ] Note the Linux signing posture in the release notes (DEB and AppImage are
      unsigned; the AppImage is the update channel, the DEB is manual-install
      only).

---

## 5. Product copy and docs

Public messaging still says beta in six places, and two of them contradict each
other today: the homepage says **source-only** while the README says packaged
installers are published.

- [ ] `README.md` — replace the "Beta status" section with the 1.0 support
      posture, and remove "plugin/runtime contracts may change during beta" or
      restate it accurately.
- [ ] `apps/docs-site/docs/reference/support-scope.md` — same pass. This page is
      the canonical support contract; keep the README consistent with it.
- [ ] `apps/docs-site/docs/reference/known-limitations.md` — confirm nothing
      there is only true during beta.
- [ ] `apps/docs-site/docs/guide/overview.md:11` — "public beta desktop release".
- [ ] `apps/homepage/src/content/copy.ts:65,242` — `"Sero · source beta · local-first"`.
- [ ] `apps/homepage/src/components/TopBar.astro:15` — `[ download beta ↓ ]`.
- [ ] `apps/homepage/src/components/Beta.astro` — `honest_beta`, and the
      "Source-only OSS beta" line. Resolve the source-only contradiction
      regardless of the version number.
- [ ] `CONTRIBUTING.md` §"Release and versioning notes" — "During beta" bullets
      need a 1.0 equivalent.

### Docs that must exist before stable

- [ ] An **upgrade guide** for 0.9-beta → 1.0 covering what
      `migrateExistingInstall()` and `migrateLegacyProfileUserData()` do to an
      existing profile, and what a user should back up first.
- [ ] Issue #526 — docs for Agent Board and Web Remote. `remote-control.md` is a
      large guide shipping with stale references.
- [ ] `apps/docs-site/docs/reference/testing-evals.md` documents the tool-check
      coverage gate, how to add a scenario or exemption, and how to start a full
      run locally and in CI (open task 9.3 in
      `openspec/changes/verify-agent-tools-for-real`).

---

## 6. Open scope to close

From the `v1.0` label:

- [ ] #635 — packaged v1.0 install-to-result and recovery journey (see §2).
- [ ] #663 — Apple Container: Git app and VCS status can report blank or stale
      repository state. Data-integrity class bug on a supported runtime.
- [ ] #665 — real-model pass at the Room member and Architect owner sites.
- [ ] #667 — macOS Room wake failure unconfirmed. Unconfirmed means unknown
      user-visible breakage.
- [ ] #632 — onboarding: one complete sample repository repair (partly landed in
      `587cc7e3b`).

From `openspec/changes/verify-agent-tools-for-real`:

- [ ] 7.1 — action and site passes with `SERO_E2E_RUNTIME=docker` on Linux.
- [ ] 7.2 — same passes with `SERO_E2E_RUNTIME=apple-container` on a Mac. The
      last container run's fixes were reviewed without a re-run; 1.0 should pay
      for that run.
- [ ] 9.1 — `tool-check.yml` verified from a manual dispatch on all four
      targets (`linux-host`, `linux-docker`, `macos-host`, `windows-host`).
- [ ] 9.3 — the testing-evals documentation above.

---

## 7. Cut the release

The release workflow triggers on a `v*` tag and creates a **draft** release by
default.

- [ ] Tag pushed from `main` (`release-it` enforces `requireBranch: main`).
- [ ] All four targets built: `macos-arm64`, `linux-x64`, `linux-arm64`,
      `windows-x64`. Drop a target only deliberately, and say so in the notes.
- [ ] Draft release notes read correctly — they are extracted from `CHANGELOG.md`
      at the tag by `scripts/extract-changelog-release-notes.mjs`. Reformat the
      section in `CHANGELOG.md` before tagging if the output is unusable.
- [ ] Artifact names match `Sero-${version}-{platform}-{arch}.{ext}`; the publish
      job deletes stale assets whose version does not match the tag.
- [ ] Verify the mac artifact is signed and stapled (§4) **before** publishing.
- [ ] Publish the draft only when the user asks.

---

## 8. Post-release verification

- [ ] Install from the published artifact on a clean machine for each supported
      platform: macOS Apple Silicon, Linux x64, Linux arm64, Windows x64.
- [ ] Launch from the installed app and complete onboarding, including the
      sample repository repair.
- [ ] Confirm the updater reaches the expected channel: an installed
      `1.0.0-rc.N` offers `1.0.0` once it exists, and an installed `1.0.0` does
      **not** offer a later prerelease (§3.2).
- [ ] Confirm the docs site deployed (`Deploy` workflow) and the support-scope
      page matches what shipped.
- [ ] Close the `v1.0` labelled issues and archive the completed openspec
      change.

---

## Appendix: why the gates are shaped this way

- `E2E Contract` and `E2E Agent` are manual because each full run is expensive
  and slow; they are pre-release evidence, not per-PR gates.
- `Tool Check` is manual for the same reason — it runs every agent action for
  real, including a paid real-model pass. See the cost note in
  `openspec/changes/verify-agent-tools-for-real/tasks.md`.
- `Test` is the per-PR gate and covers typecheck, unit tests, and the contract
  project. It is not sufficient evidence on its own for a release.
