# HN launch gate audit (task 5.3)

Status: evidence audit, refreshed 2026-07-08. This verifies every hard gate with
evidence, not assertion. **Do not post to HN (task 5.4) until every gate is
GREEN.** Re-run this audit right before posting.

Legend: 🟢 met (evidence below) · 🟡 partly met / blocked on a named action ·
🔴 not met.

## Summary

| # | Hard gate | Status | Blocking action |
| --- | --- | --- | --- |
| 1 | Packaged build works on every platform named in the README | 🟡 | Human open-and-run on Windows + Linux (or narrow the claim) |
| 2 | A new user completes the quick start in ≤10 min | 🔴 | An external tester does a timed run (gate 6) |
| 3 | README and homepage agree on release status | 🟢 | — (deploy homepage so the public page matches) |
| 4 | Flagship demo repeatable live, or labelled timelapse | 🟡 | Dan records 3.3 |
| 5 | Trust notes answer permissions questions; security FAQ ready | 🟢* | Dan approves the 5.2 FAQ |
| 6 | At least one external tester completed the install path | 🔴 | Dan recruits one external tester |
| 7 | A held-back demo / fresh angle exists so HN sees something new | 🟡 | Designate the held-back demo in 3.5 |

**Bottom line:** three gates hinge on one missing thing — **an external tester
doing a timed install + quick-start run** (unblocks 2, most of 1, and 6). The
rest hinge on **Dan recording the flagship demo (3.3)**. Everything the campaign
can evidence from inside the repo is already green.

---

## Gate 1 — Packaged build works on every named platform

README names macOS (Apple Silicon), Windows (x64), Linux (x64/arm64).

- 🟢 **Assets exist for all named platforms.** `v0.4.0-beta.0` ships
  `Sero-0.4.0-beta.0-macos-arm64.dmg`, `-windows-x64-setup.exe`,
  `-linux-x64.deb`, `-linux-arm64.deb` (release audit §1;
  `apps/desktop/electron-builder.yml`).
- 🟢 **CI smoke-tests all four targets.** `.github/workflows/release.yml` builds
  and smoke-tests a 4-target matrix (macos-arm64, linux-x64, linux-arm64,
  windows-x64) before publishing.
- 🟡 **Human-validated only on macOS.** The README itself scopes the
  maintainer-validated baseline to macOS Apple Silicon
  ([support-scope.md](../../../apps/docs-site/docs/reference/support-scope.md)).
  "Works" on Windows/Linux is CI-smoke-tested, not confirmed by a person opening
  the app.

**To turn green:** one human opens and runs each of the Windows and Linux builds
(can be folded into the external-tester run, gate 6). If that can't happen before
launch, narrow the README/HN claim to "validated on macOS; Windows and Linux
builds are provided and CI-tested" — do not claim more than is evidenced.

## Gate 2 — New user completes the quick start in ≤10 minutes

- 🟢 **The path is real and documented.** README quick start (5 steps) +
  full [10-minute quick start](https://docs.sero-ai.dev/guide/quick-start).
- 🟢 **The flagship build path is repeatable in minutes.** `3.2` dry-run
  (`apps/desktop/e2e/flagship-dryrun.agent.spec.ts`, green) builds a working
  plugin in ~3–7 min end to end.
- 🔴 **No timed external run exists.** The ≤10-min claim has never been measured
  by someone outside the project. Phase 1 acceptance criteria asked for this
  ("one person outside the project completes the quick start in ≤10 minutes;
  record who and how long") — still open.

**To turn green:** an external tester runs the quick start from download and we
record who + elapsed time. Same person as gate 6.

## Gate 3 — README and homepage agree on release status 🟢

Verbatim match, verified 2026-07-08:

- README lines 56–58 and homepage `apps/homepage/src/content/copy.ts:243` are the
  **same sentence**: *"Sero is an open-source public beta. Packaged desktop builds
  are available for macOS (Apple Silicon), Linux (x64 and arm64), and Windows
  (x64), and developers can also run from source."*
- Signing claim also matches (README 179–181; `copy.ts:268` "macOS desktop builds
  are code-signed and notarized") — neither overclaims Windows/Linux signing.

**Caveat, not a gate failure:** the homepage isn't deployed yet (deploys from
`main` on the final PR merge — [outstanding-questions.md](../drafts/outstanding-questions.md)
item 1). Source agrees; the *public* page still shows old copy until deploy.
Deploy before or with launch so a visitor sees the aligned copy.

## Gate 4 — Flagship demo repeatable live, or labelled timelapse

- 🟢 **Repeatability proven.** `3.2` dry-run runs the flagship end to end in the
  real app, fully green, with reproduction steps in
  [demo-scripts/flagship-reproduction.md](../demo-scripts/flagship-reproduction.md).
- 🟡 **Not recorded yet.** Task `3.3` (Dan records it, approval step visible) is
  open. The gate allows a labelled timelapse with real duration stated — so the
  recording can be sped up as long as the true elapsed time is on screen.

**To turn green:** Dan records 3.3.

## Gate 5 — Trust notes answer permissions questions; security FAQ ready

- 🟢 **README trust section answers the seven obvious questions** (what runs
  locally, what leaves the machine, key storage, read/write scope, plugin code,
  loop approval, inspect/pause/stop) — README lines 145–188, backed by
  [SECURITY.md](../../../SECURITY.md) and the
  [Security & Privacy reference](../../../apps/docs-site/docs/reference/security-privacy.md).
- 🟢* **Security FAQ drafted** for HN — [security-faq.md](security-faq.md) (task
  5.2). Marked with an asterisk only because it's Agent→Dan and awaits Dan's
  approval; content is ready.

## Gate 6 — At least one external tester completed the install path 🔴

No external tester is on record. This is the single most load-bearing gap: it
gates the *evidence* for gates 1 and 2, and HN's first question is often "did
anyone outside the team actually run this". **To turn green:** Dan recruits one
person outside the project to download, install, connect a model, and run the
first workflow; we record who, platform, and elapsed time in
[metrics-log.md](../metrics-log.md).

## Gate 7 — A held-back demo / fresh angle exists for HN

- 🟢 **Six demo scripts exist** ([demo-scripts/](../demo-scripts/)); the flagship
  self-extending story is a strong fresh angle.
- 🟡 **None recorded, none designated held-back.** Task `3.5` is meant to store
  the demos and mark which one is reserved for HN — not done. Strategy: keep at
  least one strong demo out of the pre-HN proof series so HN sees something new.

**To turn green:** once 3.3/3.4 are recorded, 3.5 designates the held-back demo.

---

## What Dan needs to do to clear the board

1. **Record the flagship demo (3.3)** → clears gate 4, feeds gate 7.
2. **Recruit one external tester** to do a timed install + quick-start run on
   Windows or Linux → clears gate 6, gives evidence for gates 1 and 2.
3. **Deploy the homepage** (part of the final PR merge) → makes gate 3 true in
   public, not just in source.
4. **Approve the 5.2 security FAQ** → finalises gate 5.
5. **Designate the held-back demo (3.5)** after recording → clears gate 7.

Nothing here is agent-executable — every remaining gate needs a recording, a real
external human, a deploy, or a sign-off.
