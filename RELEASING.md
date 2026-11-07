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

Status as of 2026-11-07, `acaa06fb7` on `main`. A checked item names the run that
proves it; an unchecked one says what is still missing.

- [x] `E2E Contract` is green on all three runners (Ubuntu, macOS, Windows).
      Manual dispatch only. 87 passed on each, run `42377830666`.
      `gh workflow run e2e-contract.yml`
- [ ] `E2E Agent` is green at `mode=full`. Not yet: the CI job lacks `rg` and
      `rtk`, which the managed toolchain provides and that job never installs, so
      most of the suite cannot run there. Its serial mode means a first failure
      hides the rest, which is why a "6 passed" run was really ~7 of ~73 tests.
      Decided 2026-11-07: fix the environment, timeboxed, before relying on this
      gate.
      `gh workflow run e2e-agent.yml -f mode=full`
- [ ] `E2E Workflow` is green for the target runtime the release claims. Not run
      since 2026-09-26, and it still builds the app without the plugin UIs
      (§1 note below).
      `gh workflow run e2e-workflow.yml -f os=macos -f runtime=host`
- [ ] `Tool Check` is green on every target the release supports. Authorised
      2026-11-07: run the paid real-model pass (recorded cost $0.009). This is the
      "every agent tool for real" gate (issue #626) and it also runs by hand.
      `gh workflow run tool-check.yml -f target=all`
- [x] `Test` is green on `main` at the release commit — `acaa06fb7`.
      (`pnpm typecheck && pnpm build && pnpm test && pnpm e2e:contract` locally,
      or the CI job of the same name).
- [ ] `React Doctor` has no new findings on the release commit. Not checked.
- [ ] No open `v1.0` labelled issue that names user-visible breakage. Five are
      open: #632, #635, #663, #665, #667.
      `gh issue list --label v1.0 --state open`

### What the first green contract run cost

`E2E Contract` had failed on every scheduled night from 2026-10-28, and both
suites are now manual dispatch only rather than nightly. The Windows job had
never run a single test: it died at `actions/checkout`, because archived OpenSpec
evidence paths reach 277 characters against Windows' 260-character limit. That
had also left the **Windows release build** unable to check out since
`d0b8b7106` (2026-10-19), which no gate reported.

Fixing the checkout turned "three failures" into five distinct defects, four of
them previously invisible:

- the long-path checkout itself, and the Windows release build it blocked
- `pnpm --filter @sero/desktop build` produced an app with **no plugin UIs**.
  The desktop build only copies each plugin's `dist/ui`, and `dist/` is
  gitignored, so every e2e workflow was testing empty plugin panels. Only turbo
  knows the plugin builds come first.
- `resolveContainerPath` treated only a leading `/` as absolute, so a Windows
  path became `/workspace/C:\...` and was refused as outside the workspace.
  Every read of a host path outside the workspace broke on Windows.
- a consent card whose click reported success while the card sat for its full
  120s timeout, which is a denial.

Treat a Windows result as newly-established evidence, not as a formality.

---

## 2. Release acceptance: the packaged journey

- [x] A **packaged** build launches and runs one real task to a result.
      `pnpm --filter @sero/desktop e2e:packaged` packs the app, then
      `e2e/release-journey.packaged.spec.ts` asserts `isPackaged`, reports the
      version, and runs a real `bash` task through the packaged runtime. Two
      tests, ~8s once packed. Issue #635, first slice.
- [ ] A **packaged** build survives force-termination during active work, a
      pending decision and delivery, and preserves reachable results and honest
      interrupted/unknown states on restart. Decided 2026-11-07: this ships as a
      documented limit, and the release notes say so.
- [ ] **BLOCKS 1.0** — a **packaged** build upgrades from the latest beta with
      profiles, sessions, memory, projects and plugin state intact, and a
      documented tested recovery procedure. This touches existing users' data,
      so it is the one journey that cannot ship unproven.

      **Adoption fixed 2026-11-07.** `e2e/upgrade-journey.packaged.spec.ts` seeds a
      real pre-1.0 install (`<root>/agent/`, no `profiles.json`) and confirms the
      packaged app adopts it, opens the Default profile instead of first-run
      setup, and keeps memory, app state and a session recorded before the
      upgrade. Adoption failed because `ProfileManager` caches the registry from
      its constructor and nothing reloaded it, so the registry migration wrote was
      invisible for the whole session. `env` now calls `reload()` when migration
      wrote one.

      The session fixture is synthesized from the shape a real 0.9 profile uses
      (`agent/sessions/<ts>_<id>.jsonl`, a `session` header then typed records),
      so the test does not depend on anyone's home directory.

      Still unproven on this journey: **projects**, and the recovery procedure
      written down end to end.

Nothing else in the gate list proves a shipped artifact works — the rest runs
from a development tree. Do not tag before the packaged items pass.

---

## 3. Release mechanics

### 3.1 Version and channel

The release script syncs only the root and `apps/desktop` versions
(`scripts/sync-release-package-version.mjs`).

- [ ] Decide the channel: `1.0.0-rc.N` (candidate) or `1.0.0` (stable).
- [x] `release:rc` scripts exist in `package.json` — added 2026-11-07 beside
      `release:beta` / `release:stable`: `release-it --preRelease=rc` and a dry
      variant.
- [x] Decided 2026-11-07: the five published packages stay on their own 0.x
      train. Their APIs are not stable, so claiming 1.0 would promise something
      that is not true. Support scope states that plugin contracts are versioned
      separately from the app. Bump each package you touch in the same PR.

```bash
pnpm release:rc:dry        # inspect the changelog and bump first
pnpm release:rc            # tag and push v1.0.0-rc.1
```

### 3.2 Updater channel policy

`apps/desktop/electron/features/updater/updater.ts:91` hardcodes
`autoUpdater.allowPrerelease = true`, with a comment saying to flip it off for a
stable channel.

- [x] `allowPrerelease` now follows the running version's own channel:
      `autoUpdater.allowPrerelease = app.getVersion().includes('-')`. An RC takes
      RC updates and a stable build cannot silently install a later prerelease,
      so nothing needs flipping at stable.

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

The gap was that nothing **failed** a release where signing silently fell back
to the ad-hoc path in `apps/desktop/scripts/after-pack.mjs`, because
`codesign --verify --deep --strict` passes on an ad-hoc bundle too. The job now
asserts the release identity directly:

```bash
codesign -dv --verbose=4 "$app_path" 2>&1 | grep -q "Developer ID Application"
codesign -d --verbose=2 "$app_path" 2>&1 | grep -q "flags=.*runtime"
spctl -a -t exec -vvv "$app_path"
xcrun stapler validate "$app_path"
```

- [x] Those four assertions are in the macOS job in `release.yml`, so an
      unsigned or un-notarized artifact fails the release instead of shipping.

- [ ] Confirm the RC artifact carries a valid ticket by installing it on a clean
      Mac profile and launching it with Gatekeeper active.

### Windows and Linux

- [x] Decided 2026-11-07: 1.0 ships the Windows NSIS installer **unsigned**, and
      the install docs say so. No certificate is being acquired; revisit only if
      a user or distributor needs it.
- [ ] Note the Linux signing posture in the release notes (DEB and AppImage are
      unsigned; the AppImage is the update channel, the DEB is manual-install
      only).

---

## 5. Product copy and docs

Decided 2026-11-07: **packaged installers are the product.** The homepage, README
and docs lead with downloads; building from source is the developer path. That
resolves today's contradiction, where the homepage says **source-only** while the
README says packaged installers are published.

Supported targets stay macOS Apple Silicon, Linux x64, Linux arm64 and Windows
x64. Windows installers are unsigned (§4).

- [ ] `README.md` — replace the "Beta status" section with the 1.0 support
      posture, and remove "plugin/runtime contracts may change during beta" or
      restate it accurately.
- [ ] `apps/docs-site/docs/reference/support-scope.md` — same pass. This page is
      the canonical support contract; keep the README consistent with it. Decided
      2026-11-07: keep the "internal plugin and runtime APIs may change" caveat,
      consistent with the five published packages staying on 0.x.
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

From the `v1.0` label. Decided 2026-11-07: **only #663 blocks 1.0.** #665, #667
and #632 ship with their limits stated in the release notes.

- [ ] #635 — packaged v1.0 install-to-result and recovery journey (see §2).
- [ ] #663 — **BLOCKS 1.0.** Apple Container: Git app and VCS status can report
      blank or stale repository state. Data-integrity class bug on a supported
      runtime.
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

From the dependency backlog:

- [ ] #506 — decided 2026-11-07: triage the **6 critical** advisories before 1.0
      and fix or explicitly accept each one. The high and moderate counts ship
      with a stated number rather than a vague promise.

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
      **not** offer a later prerelease (§3.2). Decided 2026-11-07: a 0.9 beta
      install offers 1.0 and installs it through the normal restart-to-update
      prompt.
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
