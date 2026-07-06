# Sero Growth Strategy — Implementation Plan

Status: in progress (P1 + P2 batches dispatched 2026-07-06)
Strategy: [sero-growth-strategy.md](sero-growth-strategy.md)
Plan date: 2026-07-06
Targets: 1,000 GitHub stars + 100 successful first runs

## How this plan works

- The campaign is executed primarily by agents (subagents now, Orchestrator loops once Phase 2 delivers them). Dan reviews, approves, records demos, and fronts launch conversations.
- Every task has an **owner**: `Agent` (subagent can do it end-to-end), `Agent→Dan` (agent produces, Dan approves/publishes), or `Dan` (only Dan can do it — recording, accounts, GitHub settings UI).
- Tasks in the same **parallel group** (P1, P2, …) are independent and can be dispatched to subagents concurrently. Tasks without a group are sequential within their phase.
- **Update rule:** when a task completes, tick its checkbox AND update the dashboard row in the same change. The dashboard must never lag the checkboxes.
- Phases 1 and 2 run in parallel. Phase 3 starts once Phase 1 copy is approved. Phases 5 and 6 are gate-driven, not date-driven.

## Dashboard

| Phase | Name | Deliverable | Status | Done / Total |
| --- | --- | --- | --- | --- |
| 1 | Conversion hardening | All public surfaces convert | Tasks complete | 8 / 8 |
| 2 | Campaign engine | 5 growth loops producing drafts | In progress | 5 / 6 |
| 3 | Demo production | 6 proof demos recorded | Not started | 0 / 5 |
| 4 | Proof series + community | Flagship post live, builders open | Not started | 0 / 6 |
| 5 | HN launch | Front-page-ready Show HN shipped | Not started | 0 / 5 |
| 6 | Borrowed distribution | 8-week sustained reach | Not started | 0 / 5 |

Weekly metrics snapshot (stars, first runs, traffic) lives in the `github-star-dashboard` loop output once Phase 2 lands; until then, capture manually in [metrics-log.md](metrics-log.md).

---

## Phase 1 — Conversion hardening

**Goal:** a first-time visitor understands Sero in 10 seconds and can try it in 10 minutes.
**Deliverable:** README, homepage, repo metadata, and release surfaces all aligned to the new positioning.

### Tasks

- [x] **1.1** (Agent→Dan, P1) GitHub repo About: description, website URL, topics — draft exact values, apply via `gh api` after approval. *(Approved & applied 2026-07-06 — description, website, and 12 topics live; verified via API.)*
- [x] **1.2** (Agent→Dan, P1) Social preview: produce the image ("Sero / Where AI agents come to work", dark, phoenix mark, UI strip). Dan uploads via GitHub settings UI. *(Done 2026-07-06 — image approved and uploaded by Dan.)*
- [x] **1.3** (Agent→Dan, P1) README rewrite: new positioning intro, top CTA block (watch demo / download / star / quick start), trust & privacy section (incl. code-signed builds), placeholder slot for flagship demo GIF. *(Approved 2026-07-06 — in working tree; signing claim scoped to macOS per release audit.)*
- [x] **1.4** (Agent→Dan, P1) Quick start: 10-minute path stating model requirements up front (hosted API key or local OpenAI-compatible server — Ollama/LM Studio/vLLM presets) and approximate flagship-workflow cost. *(Approved with revisions 2026-07-06 — cost section removed per Dan; placed as condensed README block + full docs-site page at /guide/quick-start.)*
- [x] **1.5** (Agent→Dan, P1) Homepage (`apps/homepage`): new hero ("Stop chatting with agents. Put them to work."), single release-status statement with named platforms, local-first trust statement, "get beta updates" email capture. *(Approved 2026-07-06 — in working tree, build passes; deploy + email backend choice pending, see drafts/outstanding-questions.md.)*
- [x] **1.6** (Agent→Dan, P1) Repo hygiene: LICENSE visible, CONTRIBUTING.md, issue templates, CI badge in README. *(Approved 2026-07-06 — most hygiene pre-existed; template updates in tree; blank issues kept enabled per Dan.)*
- [x] **1.7** (Agent→Dan, P1) Release clarity: audit latest release naming/assets so Sero Desktop is unmistakable; propose renames if needed. *(Approved & applied 2026-07-06 — Latest badge moved to Sero Desktop v0.4.0-beta.0, internal artifacts marked pre-release with Internal: prefixes; release.yml now auto-titles/auto-latests and prepends a platforms/download header.)*
- [x] **1.8** (Agent, P1) Start GitHub traffic/referrer snapshots (14-day retention): capture now via `gh api`, store first data point in [metrics-log.md](metrics-log.md), repeat weekly until the dashboard loop takes over. *(Done 2026-07-06 — first snapshot captured: 16 stars, 17 unique visitors/14d, raw referrer data preserved.)*

All eight tasks are independent — dispatch P1 as one parallel batch of subagents, then review the outputs together.

### Acceptance criteria

- [ ] README and homepage state the identical release status and name the packaged platforms.
- [ ] Sharing the repo link on X/Discord shows the custom social card.
- [ ] One person outside the project completes the quick start in ≤10 minutes (record who and how long).
- [ ] A fresh-eyes agent given only the README answers "what is Sero, who is it for, how do I try it" correctly from the first screenful.
- [ ] First traffic snapshot committed to metrics-log.md.

---

## Phase 2 — Campaign engine (growth loops)

**Goal:** the loops that will run the campaign exist and produce useful drafts with zero external side effects.
**Deliverable:** five loops runnable locally, each having produced at least one real artifact.

Runs in parallel with Phase 1. Each loop is an independent build — dispatch P2 as parallel subagents (worktree isolation if they touch shared files).

### Tasks

- [x] **2.1** (Agent, P2) `github-star-dashboard` — daily; stars/forks/watchers/downloads/traffic → markdown dashboard. Takes over the manual snapshots from task 1.8. *(Done 2026-07-06 — authored at docs/marketing/loops/github-star-dashboard/, validated with the plugin's install-time validators; first real run happens in 2.6.)*
- [x] **2.2** (Agent, P2) `proof-moment-miner` — on merged PR; most demoable change → post idea + demo script. *(Done 2026-07-06 — authored at docs/marketing/loops/proof-moment-miner/; no pr-merged event kind exists, so it triggers on github:main-updated and resolves merged PRs from the push range; validated incl. the real vitest install harness.)*
- [x] **2.3** (Agent, P2) `demo-script-generator` — manual trigger; feature → 60-second shot list. *(Done 2026-07-06 — authored at docs/marketing/loops/demo-script-generator/, validated; feature input via inbox file or parked human question since manual triggers carry no payload.)*
- [x] **2.4** (Agent, P2) `release-launch-pack` — on release tag; release notes + X thread + HN draft + Reddit variants (drafts only). *(Done 2026-07-06 — authored at docs/marketing/loops/release-launch-pack/; no release/tag event kind exists in the orchestrator, so it cron-polls every 6h with per-tag idempotence; validated.)*
- [x] **2.5** (Agent, P2) `community-digest` — weekly; Discord/issues/PRs → community update draft. *(Done 2026-07-06 — authored at docs/marketing/loops/community-digest/; GitHub-only sources since Sero can't read Discord — manual paste-in slot at docs/marketing/community-inbox.md; validated.)*
- [ ] **2.6** (Agent) Run all five against real repo state; file the outputs; fix what's weak. (After 2.1–2.5.)

### Acceptance criteria

- [ ] Each loop runs end-to-end from its trigger and produces its artifact.
- [ ] No loop posts, sends, or writes anywhere public — drafts and reports only, verified by inspection of each loop's steps.
- [ ] `github-star-dashboard` has produced a dashboard with real numbers, including the traffic snapshot.
- [ ] At least one `proof-moment-miner` output is good enough that Dan would actually post it.
- [ ] Loops live as local drafts, not in the official catalog (per strategy: no `sero-growth-catalog` repo until launch surfaces are strong).

---

## Phase 3 — Demo production

**Goal:** the six proof demos exist as recorded assets.
**Deliverable:** flagship demo (60–90s) + zero-to-first-workflow demo embedded in README/homepage; four more in the bank, at least one held back for HN.

Depends on Phase 1 copy approval (demos must show the shipped positioning) and benefits from 2.3.

### Tasks

- [ ] **3.1** (Agent, P3) Scripts + shot lists for all six demos (use `demo-script-generator` where it helps): 1 self-built plugin, 2 agent sees the app, 3 durable loop, 4 PR lifecycle, 5 project memory, 6 zero-to-first-workflow.
- [ ] **3.2** (Agent, P3) Dry-run the flagship workflow (Sero builds a release-checklist plugin, reviewed and approved) until repeatable; document the exact reproduction steps.
- [ ] **3.3** (Dan) Record flagship demo — approval points visible on screen; if timelapsed, real duration labelled.
- [ ] **3.4** (Dan) Record demo 6 — signed build download → model connect → first workflow, honest elapsed time.
- [ ] **3.5** (Agent→Dan) Cut and embed: flagship GIF/video into README top and homepage; store remaining demos; mark which one is held back for HN.

### Acceptance criteria

- [ ] Flagship demo is 60–90s, shows the review/approval step, and is repeatable live or labelled as a timelapse with real duration.
- [ ] Demo 6 shows true elapsed time ≤ the quick-start claim.
- [ ] README top-of-page proof moment is live.
- [ ] At least one strong demo is explicitly reserved for the HN launch.

---

## Phase 4 — Proof series + community opening

**Goal:** the flagship story is public and early builders have a door to walk through.
**Deliverable:** flagship X post + paced follow-ups, Early Builders discussion open, plugin guide verified.

Depends on Phase 3 flagship demo. Loops from Phase 2 draft the content; Dan approves each publish.

### Tasks

- [ ] **4.1** (Agent→Dan) Flagship X post + thread (strategy post format: hook, context, video, three concrete claims, link, low-pressure star ask).
- [ ] **4.2** (Agent→Dan) Cut flagship into 3–4 follow-up posts; schedule at a sustainable pace.
- [ ] **4.3** (Agent, P4) Verify the plugin developer guide by building a small plugin **from the docs alone** — no repo spelunking. Every gap found becomes a docs fix. This gates 4.5.
- [ ] **4.4** (Agent→Dan, P4) Pi community feedback post — complement framing only ("outgrown", never "trapped"), with a concrete feedback ask.
- [ ] **4.5** (Agent→Dan) Open `Sero 100 Early Builders` discussion; create `good first plugin`, `good first loop`, `demo wanted`, `docs wanted` labels; open the "first 25 Sero loops" roadmap issue. (After 4.3 passes.)
- [ ] **4.6** (Agent→Dan) First weekly builder log (drafted by `community-digest`); establish the weekly cadence.

### Acceptance criteria

- [ ] Flagship post published; star delta and referrer traffic captured for the 48h window after it.
- [ ] Plugin guide verification: an agent built a working plugin using only the published docs.
- [ ] Early Builders discussion open with the labels and roadmap issue live.
- [ ] X cadence running loop-drafted (target: 3+ posts/week sustained without hand-writing).
- [ ] No "trapped" framing used in Pi community or tool-specific replies (spot-check published posts).

---

## Phase 5 — HN launch

**Goal:** one excellent Show HN, gate-driven — ship it when the gates are green, not on a date.
**Deliverable:** published Show HN with founder present all day; outcome measured.

### Tasks

- [ ] **5.1** (Agent→Dan, P5) Show HN post: title "Show HN: Sero, a local-first desktop workspace for AI agents", body with demo, install path, honest beta caveats, architecture links.
- [ ] **5.2** (Agent→Dan, P5) Security FAQ: pre-written answers to the obvious objections (self-extending workspace, terminal/file access) grounded in power-user positioning, signed builds, approval points, existing in-product warnings and docs.
- [ ] **5.3** (Agent, P5) Gate audit — verify every hard gate below with evidence, not assertion.
- [ ] **5.4** (Dan) Pick the day, post, and be in the comments all day (agents draft reply suggestions live; Dan decides what to say).
- [ ] **5.5** (Agent) Post-launch capture: star delta, traffic, download counts, first-run signals into metrics-log.md within 48h.

### Hard gates (all must be evidenced before 5.4)

- [ ] Packaged build works on every platform named in the README.
- [ ] A new user completes the quick start in ≤10 minutes.
- [ ] README and homepage agree on release status.
- [ ] Flagship demo repeatable live or labelled timelapse.
- [ ] Trust notes answer the permissions questions; security FAQ ready.
- [ ] At least one external tester completed the install path.
- [ ] A held-back demo or fresh angle exists so HN sees something new.

### Acceptance criteria

- [ ] Show HN published with founder present through the day.
- [ ] Outcome recorded regardless of result: rank, comments, star delta, downloads. (A miss is data; capture it honestly.)

---

## Phase 6 — Borrowed distribution + sustain

**Goal:** compound the launch across borrowed audiences and keep the engine running to the 1,000-star / 100-first-run targets.
**Deliverable:** tailored posts in 3+ communities, awesome-list PRs, newsletter pitches, and a 4-week sustained cadence.

### Tasks

- [ ] **6.1** (Agent→Dan, P6) Subreddit-specific drafts: r/LocalLLaMA (lead with local model support — verify flagship runs well on a local model first), r/selfhosted, r/opensource, r/electronjs, r/programming. Confirm posting account has organic history per community; skip communities where it doesn't.
- [ ] **6.2** (Agent, P6) `awesome-list-scout`: find relevant lists/directories, open PRs where Sero genuinely fits.
- [ ] **6.3** (Agent→Dan, P6) Newsletter pitches to smaller AI-engineering newsletters: 60s demo, GitHub link, one sentence each on Pi, local-first, beta status.
- [ ] **6.4** (Agent→Dan) Weekly rhythm for 4+ weeks: demo clip or builder log weekly, contributor features, `community-digest` posts — all loop-drafted.
- [ ] **6.5** (Agent) Weekly metrics review against the funnel (saw demo → visited → starred → downloaded → first run → contributed); flag the biggest leak each week with one proposed fix.

### Acceptance criteria

- [ ] 3+ tailored community posts published (not copy-paste), each with 48h star/traffic delta captured.
- [ ] 2+ awesome-list PRs opened.
- [ ] 3+ newsletter pitches sent.
- [ ] 4 consecutive weeks of the weekly rhythm without a missed week.
- [ ] Funnel report exists for each week with a named biggest-leak and action taken.

---

## Parallelization summary

| Batch | Tasks | When |
| --- | --- | --- |
| P1 | 1.1–1.8 (8 subagents) | Immediately |
| P2 | 2.1–2.5 (5 subagents, worktrees) | Immediately, alongside P1 |
| P3 | 3.1, 3.2 | After Phase 1 copy approved |
| P4 | 4.3, 4.4 | Alongside 4.1/4.2 |
| P5 | 5.1–5.3 | Once Phase 4 is live |
| P6 | 6.1–6.3 | After HN launch |

Dan-only critical path: approve Phase 1 copy → record 3.3/3.4 → approve publishes → HN day. Everything else is agent work.

## Out of scope (deliberately)

- `sero-growth-catalog` public repo — only after launch surfaces are proven strong.
- `x-reply-scout`, `contributor-onboarding`, `competitor-watch`, `landing-page-auditor` loops — second wave, after the first five earn trust.
- Any auto-posting. Every external publish goes through Dan for the entire campaign.
