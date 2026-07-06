# Release surface audit — sero-labs/sero

Status: audit + proposal (no changes made on GitHub)
Date: 2026-07-06
Strategy reference: [sero-growth-strategy.md](../sero-growth-strategy.md) — "Current conversion leaks" §3 (Release clarity)

## 1. Current state

Four public releases exist. None is a draft; none is marked pre-release.

| Tag | Title | "Latest"? | Published | Assets (grouped) | Downloads |
| --- | --- | --- | --- | --- | --- |
| `v0.4.0-beta.0` | `v0.4.0-beta.0` | No | 2026-06-03 | Desktop app: `Sero-0.4.0-beta.0-macos-arm64.dmg` (143 MB), `-macos-arm64.zip` (138 MB), `-windows-x64-setup.exe` (124 MB), `-linux-x64.deb` / `-linux-arm64.deb` (~108 MB each); updater metadata: `latest.yml`, `latest-mac.yml`, `beta-linux.yml`, `beta-linux-arm64.yml`, 4 `.blockmap` files | dmg 3, mac zip 4, exe 1, debs 2; updater ymls 16 |
| `toolchains-2026-05-31` | `Host toolchains 2026-05-31` | No | 2026-05-31 | 22 `.tar.gz` tool archives (`node-*`, `pnpm-*`, `git-*`, `bash-*`, `ssh-*`, `npm-*`, `uv-*` per platform) | 26–53 each (app-driven, not humans) |
| `v0.2.4-beta.0` | `v0.2.4-beta.0` | No | 2026-05-31 | Same desktop layout as v0.4.0 | ~0–1 each |
| `browser-pack-2026-05-16` | `Sero Browser Pack 2026-05-16` | **Yes — marked Latest** | 2026-05-19 | 4 browser-pack `.tar.gz` (277–330 MB each) + 4 receipt `.json` | ~200 each (app-driven) |

Verified via `gh release list/view -R sero-labs/sero` and `gh api repos/sero-labs/sero/releases/latest` on 2026-07-06.

Release-notes bodies today:

- `v0.4.0-beta.0`: raw changelog extract (Features/Bug Fixes commit list). No platform names, no download guidance, no quick-start link.
- `v0.2.4-beta.0`: literally `Desktop release v0.2.4-beta.0`.
- Browser pack / toolchains: one-line internal descriptions ("Pinned host browser automation packs…", "Published Sero managed host toolchains…").

## 2. Verdict against the strategy bar

| Criterion | Verdict | Why |
| --- | --- | --- |
| Visitor immediately sees which release is the desktop app | **Fail** | GitHub's "Latest" badge — and the `/releases/latest` URL, and the top of `/releases` — points at **Sero Browser Pack 2026-05-16**, a 300 MB internal artifact. The README's "Download the beta" link sends people to exactly this page. Note the browser pack sits *below* v0.4.0 by date, so it holds "Latest" only because it was explicitly set as latest (its own workflow creates it with `--prerelease`; that flag was later flipped and latest ticked). Automatic latest-selection would pick v0.4.0. |
| Latest release is the desktop app | **Fail** | See above. `releases/latest` returns the browser pack. |
| Platforms covered are obvious | **Weak pass** | Asset filenames do name platform+arch (`macos-arm64`, `windows-x64`, `linux-x64/arm64`), but the release title and body never say "macOS (Apple Silicon), Windows x64, Linux x64/arm64". A visitor must parse filenames. macOS is arm64-only — nothing says so or tells Intel Mac users there is no build. |
| Other artifacts identifiable as supporting | **Fail** | Browser pack and toolchains look like peer products. Nothing on either release says "internal artifact — Sero downloads this automatically; you never need it". Their high download counts (app-driven) make them look like the popular downloads. |
| Naming consistency (tags, titles, assets) | **Mixed** | Three tag schemes coexist: `v<semver>-beta.N` (desktop), `browser-pack-<date>`, `toolchains-<date>`. Desktop titles are just the tag. Asset names are consistent and good (`Sero-<version>-<os>-<arch>.<ext>`). 8 updater-metadata files (`*.yml`, `*.blockmap`) clutter the desktop asset list with no explanation. |
| Pre-release marking | **Fail** | Beta desktop builds are full releases (defensible — see §4), but the two supporting-artifact releases are *also* full releases, which is what let one of them capture the Latest badge. |

Bottom line: the product downloads exist and are well-named, but the single highest-traffic URL (`releases/latest`) serves the wrong release, and nothing labels the desktop app as the thing to download.

## 3. How releases are produced (implementability check)

- **Workflow:** `.github/workflows/release.yml` ("Desktop Release"). Trigger: push of `v*` tags (created by `release-it`, per README) or manual dispatch. Builds a 4-target matrix (macos-arm64, linux-x64, linux-arm64, windows-x64), runs smoke tests, then a `publish` job creates/edits the release with `gh release create/edit --title "$RELEASE_TAG" --notes-file release-notes.md`. Push-tag releases are created as **drafts** (`RELEASE_DRAFT` is true for push events, line 243) and published manually — which is where the Latest checkbox gets missed.
- **Release notes:** extracted from `CHANGELOG.md` by `scripts/extract-changelog-release-notes.mjs` (repo root) in the publish job (release.yml lines 251–256).
- **Asset names:** `apps/desktop/electron-builder.yml` — `artifactName: "${productName}-${version}-<os>-${arch}.${ext}"` per platform (lines 64, 82, 90, 95, 98), productName `Sero`.
- **Supporting releases:** `.github/workflows/browser-pack-artifacts.yml` creates/uploads `browser-pack-2026-05-16` (created `--prerelease`; currently not prerelease on GitHub). Toolchains release is analogous (`toolchain:verify-published` consumes it). The desktop app resolves these by exact tag, so flipping their prerelease flag does **not** affect the app.
- **Stale-asset cleanup:** release.yml lines 301–310 deletes assets not matching `Sero-$release_version-*` — must be kept in sync with any artifact rename.

### Code-signing status (evidence-based)

- **macOS: signed AND notarized.** Repo secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` all exist (set 2026-05-26). The v0.4.0-beta.0 macOS build log (run 26875389619) shows: `Signing with Developer ID and notarizing via notarytool`, `identityName=Developer ID Application: DANIEL ROSS CARTER`, and `notarization successful`. `build-release.sh` enforces all-or-nothing notarization credentials; `electron-builder.yml` sets `hardenedRuntime: true` + entitlements for the signed path. The marketing claim "packaged desktop builds are code-signed" is **true for macOS builds from v0.4.0-beta.0 onward** (v0.2.4-beta.0, built 2026-05-31 post-secrets, is also covered).
- **Windows: NOT code-signed.** No Windows cert secret (`WIN_CSC_LINK` absent), no `win` signing config in `electron-builder.yml`, and the v0.4.0 Windows log shows electron-builder's pre-check lines (`signing with signtool.exe`) but no certificate — app-builder-lib 26.8.1 skips signing when no cert is configured (`no signing info identified, signing is skipped`). Expect SmartScreen "unknown publisher" warnings. Public copy must say "macOS builds are signed and notarized"; do not claim Windows signing.
- **Linux: unsigned** (normal for direct .deb distribution; no apt repo involved).

## 4. Proposals (exact edits)

### P1 — Fix which release is "Latest" (one-time, manual, 2 minutes)

1. `gh release edit v0.4.0-beta.0 -R sero-labs/sero --latest` — desktop app takes the Latest badge and `releases/latest`.
2. `gh release edit browser-pack-2026-05-16 -R sero-labs/sero --prerelease` and `gh release edit toolchains-2026-05-31 -R sero-labs/sero --prerelease` — supporting artifacts can never capture Latest again. Safe: the app fetches them by exact tag; the browser-pack workflow already intends `--prerelease` (browser-pack-artifacts.yml line 47).
3. Point the README/homepage download CTA at `https://github.com/sero-labs/sero/releases/latest` (not `/releases`) once step 1 is done.

### P2 — Release titles say what the release is

- Desktop: title `Sero Desktop v0.4.0-beta.0` (pattern: `Sero Desktop <tag>`).
- Supporting: retitle existing releases `Internal: Sero Browser Pack 2026-05-16` and `Internal: Host Toolchains 2026-05-31` (prefix makes them self-explanatory in the release list).

Workflow edit for future desktop releases — `.github/workflows/release.yml`, publish step (lines 287 and 296), change both title args:

```
--title "Sero Desktop $RELEASE_TAG"
```

And `browser-pack-artifacts.yml` line 43-ish: `--title "Internal: Sero Browser Pack <date>"`.

### P3 — Release-notes header template (platforms + downloads + quick start)

Prepend this header to `release-notes.md` in the publish job (release.yml, after the "Extract changelog release notes" step, before create/edit), substituting the version:

```markdown
**Sero Desktop beta for macOS (Apple Silicon), Windows (x64), and Linux (x64 / arm64).**

| Platform | Download |
| --- | --- |
| macOS (Apple Silicon) — signed & notarized | `Sero-<version>-macos-arm64.dmg` |
| Windows 10/11 (x64) | `Sero-<version>-windows-x64-setup.exe` |
| Linux Debian/Ubuntu (x64) | `Sero-<version>-linux-x64.deb` |
| Linux Debian/Ubuntu (arm64) | `Sero-<version>-linux-arm64.deb` |

New to Sero? Start with the [10-minute quick start](https://github.com/sero-labs/sero#quick-start). You need a model: a hosted API key, or a local OpenAI-compatible server (Ollama, LM Studio, vLLM).

The `.yml`, `.blockmap`, and macOS `.zip` files below are auto-update metadata — you don't need them.

---
```

Implementation: add a step in release.yml that writes the header (heredoc with `${RELEASE_TAG#v}` for `<version>`) and `cat`s the changelog extract after it; or extend `scripts/extract-changelog-release-notes.mjs` to emit the header. Either is a ~15-line change. Note the macOS caveat: there is **no Intel Mac build** — the table names Apple Silicon explicitly, which also satisfies the strategy rule "do not say supported platforms unless the next sentence names them".

### P4 — Asset naming (optional, forward-only)

Current names (`Sero-0.4.0-beta.0-macos-arm64.dmg`) already carry platform+arch and are acceptable. If the strategy's `Sero-Desktop-` prefix is wanted, edit `apps/desktop/electron-builder.yml`:

- line 64/95: `artifactName: "${productName}-Desktop-${version}-macos-${arch}.${ext}"`
- line 82: `...-Desktop-${version}-linux-${arch}.${ext}`
- line 90/98: `...-Desktop-${version}-windows-${arch}[-setup].${ext}`

**Must change in lockstep:** release.yml line 307 stale-asset pattern `"$asset" == Sero-* && "$asset" != Sero-"$release_version"-*` → match `Sero-Desktop-"$release_version"-*`, and README lines that reference asset names. Never rename assets on already-published releases (electron-updater feeds reference them). Recommendation: skip P4 for now — P1–P3 deliver the clarity; renaming adds churn to updater-adjacent code for marginal gain.

### P5 — Pre-release policy going forward

- Desktop beta releases stay **full releases marked Latest** (a repo whose every release is "pre-release" has no Latest badge and a dead `releases/latest` URL; electron-updater's default channel also expects full releases). Beta status is carried by the version string and notes header.
- Add `--latest` to the create/edit calls in release.yml (same lines as P2) so the badge is automatic and never depends on a manual checkbox at draft-publish time:

```
gh release edit "$RELEASE_TAG" ... --latest "${draft_args[@]}"   # edit path
create_args+=(--latest)                                          # create path
```

(`--latest` with `--draft` is applied when the draft is published.)
- All future supporting-artifact releases (browser packs, toolchains) are created `--prerelease` with an `Internal:` title prefix — enforce in their workflows, not by convention.

### P6 — README/homepage agreement (hand-off note)

README already says builds exist for named platforms and links to `/releases`; after P1 it should link to `/releases/latest`. The claim at README line ~172 ("macOS release builds run a signing and notarization step in CI") is confirmed true; public copy can say "macOS builds are code-signed and notarized" but must not extend that claim to Windows until a Windows cert is added (tracked separately if desired: `win.signtoolOptions` + `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` secrets, or Azure Trusted Signing).

## 5. Summary of required edits

| Change | Where | Type |
| --- | --- | --- |
| Mark v0.4.0-beta.0 as Latest; browser pack + toolchains as prerelease; retitle all four | GitHub UI / `gh release edit` | One-time manual |
| Title `Sero Desktop <tag>` + `--latest` | `.github/workflows/release.yml` lines 287, 296 | Workflow edit |
| Notes header (platforms, download table, quick-start link, updater-files note) | `.github/workflows/release.yml` publish job (or `scripts/extract-changelog-release-notes.mjs`) | Workflow/script edit |
| Browser-pack title prefix + keep `--prerelease` | `.github/workflows/browser-pack-artifacts.yml` | Workflow edit |
| (Optional) `Sero-Desktop-` asset prefix | `apps/desktop/electron-builder.yml` + release.yml line 307 | Deferred |
| Windows code signing | New secrets + `electron-builder.yml` `win` block | Separate task if wanted |
