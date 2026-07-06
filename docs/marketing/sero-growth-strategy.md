# Sero Growth Strategy

Status: initial strategy draft  
Goal: grow Sero from early visibility to 1,000 GitHub stars  
Draft date: 2026-07-06

## Executive summary

Sero does not appear to have a product substance problem. It has a proof, positioning, and distribution problem.

The project already has a strong technical base: a local-first desktop shell, visual browser, runtime-backed workspaces, persistent project memory, self-building plugins, and Orchestrator loops. The public message needs to make those strengths obvious in seconds.

The recommended positioning is:

> Sero is the local-first desktop cockpit where coding agents can see your app, run your repo, remember the project, and build their own tools.

The campaign should not try to market Sero as another generic AI workspace or personal assistant. The sharper wedge is:

> OpenClaw is the personal assistant. Sero is the agent workbench.

The first major public push should be built around a single proof moment:

> I built an AI workspace that can extend itself.

That message is memorable, demonstrable, and already aligned with Sero's self-building plugin and Orchestrator loop direction.

## Target outcome

Primary goal:

- Reach 1,000 GitHub stars.

Secondary goals:

- Convert Sero from a hidden project into a recognised open-source agent workspace.
- Build a small but real early builder community.
- Make plugins and loops the core community object.
- Create a repeatable growth system that Sero itself can help run through Orchestrator loops.

## Strategic thesis

People do not share architecture. They share proof.

Sero's public growth should be based on repeatedly showing moments that make people say:

- That is not just a chat UI.
- The agent can actually see the product.
- The workspace can extend itself.
- This is what terminal agents feel like once they have a real desktop cockpit.

The campaign should therefore prioritise short, visual, repeatable demos over broad claims.

## Current conversion leaks

Before chasing virality, the surfaces that receive attention need to convert better.

### 1. Repo metadata

The GitHub repo should have a clear About description, website, and topics.

Suggested description:

> Local-first desktop cockpit for coding agents: chat, terminal, browser, memory, plugins, runtimes, and long-running loops in one workspace.

Suggested topics:

- `ai`
- `ai-agent`
- `coding-agent`
- `agent-workspace`
- `local-first`
- `desktop-app`
- `electron`
- `typescript`
- `open-source`
- `pi-agent`
- `developer-tools`
- `automation`

### 2. Social preview

Create a custom GitHub social preview image.

Suggested copy:

> Sero  
> The local-first desktop cockpit for coding agents

Design direction:

- dark luxury background
- phoenix mark or Sero logo
- one screenshot strip or blurred app UI
- high contrast text
- no clutter

### 3. Release clarity

The latest public release surface should make the desktop app obvious.

Desired result:

- A visitor immediately understands where to download the packaged desktop beta.
- Release naming should make it obvious whether the release is Sero Desktop, a browser pack, a runtime image, or a supporting artifact.
- The README and homepage should agree about whether the project is packaged beta, source beta, or both.

### 4. README proof moment

The README explains the product, but it needs a top-of-page proof moment.

Add a GIF or short video near the top showing one impressive workflow:

- Sero receives a request.
- Sero uses chat, terminal, browser, files, and plugin UI in one workspace.
- The agent sees the app or builds a plugin or loop.
- The result is visible and concrete.

Suggested top CTA block:

- Watch Sero build a plugin
- Download the beta
- Star the repo
- Read the quick start

### 5. Homepage message alignment

The homepage should match the current release posture.

Avoid mixed signals such as:

- packaged beta in README
- source-only beta on homepage

Use one clear status statement.

Suggested wording:

> Sero is an open-source public beta. Packaged desktop builds are available for supported platforms, and developers can also run from source.

## Core positioning

### Main category

Sero is an agent workbench.

### One-line pitch

> Sero is a local-first desktop cockpit for coding agents.

### Slightly longer pitch

> Sero brings chat, terminal, browser, previews, files, plugins, project memory, runtimes, and long-running agent loops into one local-first workspace.

### Founder-style pitch

> Terminal agents are powerful, but real software work is not just terminal text. It spans code, browser state, screenshots, local services, Git, memory, tools, and long-running workflows. Sero gives coding agents a desktop cockpit for that whole loop.

### Comparison positioning

Do not lead with competitor comparisons, but use them when needed.

- OpenClaw: personal assistant.
- OpenHands: cloud or app coding agent environment.
- Cursor: AI editor.
- Claude Code or Codex CLI: terminal coding agent.
- Sero: local-first desktop cockpit and workbench for coding agents.

## Viral angle

The first campaign should be based on this line:

> I built an AI workspace that can extend itself.

This works because it connects directly to Sero's self-building plugin story.

The flagship demo should be:

> I asked Sero to build itself a release manager.

In a 60 to 90 second clip:

1. Ask Sero for a release-checklist plugin or Orchestrator loop.
2. Sero creates the plugin or loop.
3. The UI appears inside Sero.
4. It checks repo state, tests, changelog, release notes, and open PRs.
5. It produces a release readiness report or opens a PR.

This is the first proof moment because it shows the product thesis instantly.

## Five proof demos

The campaign needs five repeatable demos rather than endless announcements.

### Demo 1: Sero builds itself a plugin

Hook:

> I asked my AI workspace to add a feature to itself.

Show:

- prompt
- agent work
- plugin files
- live UI inside Sero
- result

### Demo 2: Sero sees the app

Hook:

> Coding agents are usually blind. Sero gives them eyes.

Show:

- app running in the visual browser
- screenshot capture
- agent identifies UI issue
- agent patches code
- browser verifies the fix

### Demo 3: Sero runs a durable loop

Hook:

> This is not a one-shot prompt. It is a durable agent loop.

Show:

- prompt to create a loop
- generated step plan
- sequential and parallel steps
- failure recovery
- final completion signal

### Demo 4: Sero handles PR lifecycle work

Hook:

> I let Sero watch a PR and keep it moving.

Show:

- PR event
- loop triggers
- worktree branch safety
- CI fix or review response
- PR update

### Demo 5: Sero remembers a project

Hook:

> I came back later and Sero still knew the project.

Show:

- previous session context
- project memory
- architectural question
- useful answer based on repo context

## 1000-star campaign structure

Run the campaign as three bursts over eight weeks.

### Phase 1: Conversion hardening

Timing: first 48 hours.

Tasks:

- Add GitHub repo description.
- Add GitHub website.
- Add GitHub topics.
- Add custom social preview.
- Fix homepage and README release-status mismatch.
- Make the latest desktop release obvious.
- Add flagship demo to README.
- Add simple 10-minute quick start.
- Add star and download CTAs.

Success criteria:

- A first-time visitor can understand Sero in 10 seconds.
- A developer can try Sero in 10 minutes.
- A social share has a strong preview card.

### Phase 2: Proof series

Timing: week 1 to week 3.

Publish the five proof demos as a coordinated series.

Each demo should become:

- one short video
- one X post
- one longer X thread
- one Discord post
- one README or docs embed where useful
- one short article or devlog if the demo is substantial

Post format:

1. Strong hook.
2. One sentence context.
3. Short video.
4. Three concrete product claims.
5. GitHub link.
6. Low-pressure ask to star the repo if the direction is useful.

### Phase 3: Borrowed distribution

Timing: week 2 to week 8.

The Sero X account should be the canonical build log, but it cannot be the main discovery engine yet. Growth needs borrowed audiences.

Channels:

- Pi users community.
- X replies to coding-agent conversations.
- Hacker News.
- Reddit.
- Awesome lists.
- AI engineering newsletters.
- Open-source directories.
- Developer tool communities.

Important rule:

> Do not lead with promotion. Lead with a useful observation, demo, or problem diagnosis.

## Channel strategy

### X

The current small X account should become a build-in-public and proof account.

Stop posting generic AI news unless it directly supports Sero's positioning.

Content pillars:

1. Sero proof demos.
2. Local-first agent workflows.
3. Visual browser and agent feedback loops.
4. Orchestrator loops.
5. Plugin ecosystem.
6. Honest beta devlogs.
7. Comparisons that clarify categories, not drama.

Daily X rhythm:

- 1 original post or short build log.
- 5 to 10 high-quality replies to relevant discussions.
- 1 quote post only when the Sero angle adds substance.

Example X post:

```text
Terminal coding agents are powerful, but real software work is not just terminal text.

It is browser state, screenshots, local services, files, Git, logs, memory, and tools.

That is why I am building Sero: a local-first desktop cockpit for coding agents.

Demo below.
```

Example star ask:

```text
Sero is still tiny as an OSS project, but I think this direction matters.

If a local-first agent workbench sounds useful, starring the repo genuinely helps more developers find it.
```

### Discord

Discord should be used for feedback and conversion, not discovery.

Post only when there is something concrete:

- new demo
- beta release
- loop catalogue entry
- plugin challenge
- request for testers
- Pi integration discussion

Use a feedback ask, not a marketing ask.

Example:

```text
I have a Sero demo showing an agent build and use a plugin inside the workspace. I would really value feedback from Pi users on whether this feels like a useful extension of the Pi loop or too much product surface.
```

### Hacker News

Do not post to HN until the flagship demo, README, release clarity, and homepage alignment are ready.

Possible titles:

- Show HN: Sero, a local-first desktop cockpit for coding agents
- Show HN: I built an open-source agent workspace that can extend itself
- Sero: an open-source desktop workbench for coding agents

HN launch checklist:

- demo video embedded or linked
- clear install path
- honest beta caveats
- architecture docs linked
- no overclaiming
- founder present in comments all day

### Reddit

Use different angles per subreddit.

Potential communities:

- `r/LocalLLaMA`: local-first and model-provider angle.
- `r/selfhosted`: local control and non-SaaS posture.
- `r/programming`: agent workbench and developer tooling.
- `r/opensource`: contributor and ecosystem story.
- `r/electronjs`: Electron desktop architecture and plugin UI.

Avoid dumping the same post everywhere.

### Newsletters and creators

Target smaller AI engineering newsletters before major outlets.

Pitch angle:

> Sero is an open-source local-first desktop workbench for coding agents. The interesting bit is that it can build and use its own plugins and durable loops.

Include:

- 60 second demo
- GitHub link
- one sentence about Pi
- one sentence about local-first
- one sentence about beta status

## Community strategy

Do not build a generic user community. Build an early builder community around plugins and loops.

Create:

- `Sero 100 Early Builders` GitHub Discussion.
- `good first plugin` label.
- `good first loop` label.
- `demo wanted` label.
- `docs wanted` label.
- public roadmap issue: `Help us build the first 25 Sero loops`.
- weekly builder log.

Community promise:

> Build one useful Sero plugin or loop. We will feature the best ones.

This gives contributors a clear object to create and a reason to participate.

## Sero Growth Loop Catalog

Create a separate repository first:

> `sero-labs/sero-growth-catalog`

Do not put these into the official catalog until they are proven and safe.

The official catalogue pattern is already useful: `catalog.json`, `loops/<slug>/definition.json`, `loops/<slug>/catalog.json`, and optional `example-output.md`.

The trust posture should be conservative:

- loops install as drafts
- no auto-activation
- external posts and sends require approval
- draft social content only
- no automatic spam
- no scraping beyond user-approved sources and APIs

### Initial growth loops

| Loop | Trigger | Purpose | Output |
| --- | --- | --- | --- |
| `github-star-dashboard` | Daily | Track stars, forks, issues, PRs, release downloads, and visible traction signals | Markdown dashboard |
| `proof-moment-miner` | On merged PR | Extract the most demoable change from a PR | Post idea and demo script |
| `x-reply-scout` | Daily | Find relevant conversations to reply to | Draft replies, approval required |
| `demo-script-generator` | Manual | Turn a feature into a 60 second demo script | Shot list |
| `release-launch-pack` | On release tag | Create release notes, X thread, HN draft, and Reddit variants | Launch pack drafts |
| `community-digest` | Weekly | Summarise Discord, issues, PRs, and questions | Community update |
| `contributor-onboarding` | On new issue or PR | Suggest helpful maintainer replies and labels | Draft actions |
| `awesome-list-scout` | Weekly | Find relevant awesome lists and directories | PR target list |
| `competitor-watch` | Weekly | Track adjacent projects and positioning changes | Positioning notes |
| `landing-page-auditor` | Weekly | Check homepage and README for stale claims | Copy fixes or PR |

### Highest priority first five loops

1. `github-star-dashboard`
2. `proof-moment-miner`
3. `demo-script-generator`
4. `release-launch-pack`
5. `community-digest`

These are safest because they produce drafts and reports rather than public actions.

## Initial launch pack

### Launch title

> Sero: an open-source desktop cockpit for coding agents

### Launch story

1. Terminal agents are powerful, but blind and scattered.
2. Real software work spans code, terminal, browser, previews, Git, memory, tools, and long-running workflows.
3. Sero puts that loop in one local-first desktop workspace.
4. The twist: Sero can extend itself with plugins and durable loops.
5. It is early, but packaged beta builds are available for supported platforms.

### Launch assets

- 60 to 90 second flagship demo.
- 5 proof clips.
- README hero GIF.
- GitHub social preview.
- Homepage hero update.
- HN launch post.
- Reddit variants.
- X thread.
- Discord feedback post.
- Contributor challenge issue.

## Metrics

Track weekly:

- GitHub stars.
- GitHub forks.
- GitHub watchers.
- Release downloads.
- Website visits.
- Docs visits.
- X followers.
- X post impressions.
- X profile clicks.
- GitHub link clicks where available.
- Issues opened by external users.
- PRs opened by external contributors.
- Discord replies from real users.
- Number of people who successfully install and run Sero.

North star metric before 1,000 stars:

> Number of developers who see a demo and then visit or star the repo.

North star metric after 1,000 stars:

> Number of developers who install Sero and build or run a plugin or loop.

## Things to stop doing

- Stop posting generic AI news from the Sero account.
- Stop explaining architecture before showing proof.
- Stop using broad positioning such as "advanced open-source AI personal workspace" as the main message.
- Stop relying on Discord as the main discovery channel.
- Stop making OpenClaw the central comparison.
- Stop sending people to surfaces that contradict each other on release status.

## Immediate action plan

### Day 1

- Update GitHub repo description, website, and topics.
- Create social preview image.
- Fix homepage release-status wording.
- Check release naming and latest release clarity.

### Day 2

- Record flagship demo: Sero builds itself a plugin or loop.
- Add demo GIF or video link to README.
- Add quick-start CTA near top of README.

### Days 3 to 7

- Publish five proof posts on X.
- Post one Pi-community feedback request.
- Open `Sero 100 Early Builders` discussion.
- Create labels for `good first plugin` and `good first loop`.
- Draft HN launch post, but do not publish until conversion surfaces are ready.

### Week 2

- Create `sero-growth-catalog`.
- Add the first five draft/report loops.
- Run the growth dashboard loop manually.
- Publish first weekly builder log.

### Weeks 3 to 8

- Launch on HN.
- Publish subreddit-specific posts.
- Submit to relevant awesome lists.
- Contact smaller AI engineering newsletters.
- Keep publishing weekly demo clips.
- Feature contributors and early builders.

## Decision to agree before expanding

The proposed campaign is built around this positioning:

> Sero should become known as the self-extending, local-first agent cockpit for serious software work.

If this is accepted, the next planning step should be to produce:

1. exact README changes,
2. homepage copy changes,
3. social preview concept,
4. X launch thread,
5. HN launch draft,
6. `sero-growth-catalog` repository structure,
7. first five loop definitions.

## Reference links

- Sero repo: https://github.com/sero-labs/sero
- Sero homepage: https://sero-ai.dev/
- Sero docs: https://docs.sero-ai.dev/
- Sero official loop catalog: https://github.com/sero-labs/orchestrator-catalog
- OpenClaw repo: https://github.com/openclaw/openclaw
- GitHub topics docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
- GitHub social preview docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview
