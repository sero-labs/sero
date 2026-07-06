# Sero Growth Strategy

Status: initial strategy draft  
Goal: grow Sero from early visibility to 1,000 GitHub stars  
Draft date: 2026-07-06  
Delivery plan: [sero-growth-implementation-plan.md](sero-growth-implementation-plan.md)

## Executive summary

Sero does not appear to have a product substance problem. It has a proof, positioning, and distribution problem.

The project already has a strong technical base: a local-first desktop shell, visual browser, runtime-backed workspaces, persistent project memory, self-building plugins, and Orchestrator loops. The public message needs to make those strengths obvious in seconds.

The recommended positioning is:

> Sero is where AI agents come to work.

The supporting explanation is:

> Sero is a local-first desktop workspace where agents can see, act, remember, automate, and extend themselves across your software life.

This is stronger than a feature-list pitch because it makes Sero feel like a place where agents operate, not a wrapper around a single project or repository.

The campaign should not try to market Sero as another generic AI workspace, personal assistant, or polite developer tool. The wedge should stay sharp:

> Your agents are trapped in chat boxes. Sero lets them out.

That line is intentionally provocative. Use it when the next thing the audience sees is a concrete demo. The rule is: controversy earns attention, proof keeps it.

One audience caveat: the "trapped" line takes a swipe at the tools Sero's first users already love. With Claude Code, Cursor, Codex, and Pi users, use the complement framing instead — "Your agents have outgrown the chat box" — Sero is the next step for their workflow, not a replacement for it.

The first major public push should be built around a single proof moment:

> I built an AI workspace that can extend itself.

That message is memorable, demonstrable, and already aligned with Sero's self-building plugin and Orchestrator loop direction. The demo should make human approval visible so the story feels powerful, not reckless.

## Target outcome

Primary goal:

- Reach 1,000 GitHub stars, paired with an activation target: 100 developers complete a successful first run.

Stars measure visibility. First runs measure whether the product landed. Chasing the star number without the activation number would let the campaign fool itself.

Secondary goals:

- Convert Sero from a hidden project into a recognised open-source agent workspace.
- Build a small but real early builder community.
- Make plugins and loops the core community object.
- Create a repeatable growth system that Sero itself can help run through Orchestrator loops.

## Execution model

This campaign is not a manual content plan for the founder. It is designed to be executed primarily by agents inside Sero, with the founder reviewing and approving output. That is the point: building the Orchestrator loops that run this campaign is part of the product work, and the campaign is an existence proof of the product thesis.

- Orchestrator loops and agent sessions produce the drafts: posts, replies, demo scripts, dashboards, digests, and launch packs.
- The founder's job is review, approval, recording demos, and being present in launch conversations (especially HN).
- The daily X rhythm and weekly reporting cadences in this plan assume loop-produced drafts, not hand-written posts.
- If a cadence cannot be sustained by loops plus light review, cut the cadence rather than the quality bar.

Keep the dogfooding story private until the product story has landed (see the growth catalog rules below).

## Ideal first users

Sero's first audience should not be "everyone who uses AI". It should be people who already feel the limits of chat boxes, terminal agents, and single-repo AI tools.

Prioritise:

- developers already using Claude Code, Codex CLI, Cursor, or similar agent tools;
- open-source maintainers who spend time on releases, PRs, issues, docs, and regressions;
- agent-tool builders who understand why browser state, memory, plugins, and runtimes matter;
- local-first and self-hosting users who care about control, inspectability, and avoiding SaaS lock-in;
- Pi users who understand the agent loop and can see why Sero adds a product surface around it.

The first-user promise:

> If you already use coding agents and wish they had a real workspace, Sero is for you.

This keeps the pitch broad enough to be exciting, but specific enough that demos, README copy, and community calls-to-action can speak to a real person.

## Strategic thesis

People do not share architecture. They share proof.

Sero's public growth should be based on repeatedly showing moments that make people say:

- That is not just a chat UI.
- The agent can actually see the product.
- The workspace can extend itself.
- This is what agent software feels like when it has a real place to work.

The campaign should therefore prioritise short, visual, repeatable demos over broad claims.

The tone should be sharp, not bland. Sero does not need to sound like another careful developer tool. It can challenge the category, but each challenge should be followed immediately by evidence.

Good pattern:

1. Provocative claim.
2. Concrete demo.
3. Plain explanation.
4. Honest beta caveat.

Bad pattern:

1. Provocative claim.
2. More slogans.
3. No install path.
4. No proof.

## Current conversion leaks

Before chasing virality, the surfaces that receive attention need to convert better.

### 1. Repo metadata

The GitHub repo should have a clear About description, website, and topics.

Suggested description:

> Local-first desktop workspace for AI agents: browser, terminal, memory, plugins, runtimes, and durable loops.

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
> Where AI agents come to work

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
- Supported platforms should be named directly. Do not say "supported platforms" unless the next sentence names them.
- The quick start states model requirements up front: bring an API key for a hosted provider, or point Sero at a local OpenAI-compatible model server (Ollama, LM Studio, and vLLM are supported with presets).
- The quick start states the approximate API cost of running the flagship workflow, so cost is never a surprise objection.

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

The homepage should match the current release posture and the new positioning.

Avoid mixed signals such as:

- packaged beta in README
- source-only beta on homepage
- language that makes Sero sound like a single-repo wrapper
- generic wording such as "AI personal workspace" without a sharper hook

Use one clear status statement.

Suggested wording, with platform names filled in:

> Sero is an open-source public beta. Packaged desktop builds are available for [macOS / Windows / Linux], and developers can also run from source.

If Sero is macOS-first or only one packaged build is ready, say that plainly. Clarity beats pretending the release is broader than it is.

## Trust and safety

The sharper the pitch gets, the more important trust becomes. Sero gives agents powerful surfaces: terminal, files, browser state, plugins, memory, runtimes, and long-running loops. That is the point of the product, but it also creates obvious questions.

Public materials should answer these before a skeptical developer has to ask:

- What does Sero run locally?
- What leaves the machine?
- Where are API keys and credentials stored?
- What can an agent read or write by default?
- Can plugins run arbitrary code?
- Are loops auto-approved or user-approved?
- How can a user inspect, pause, or stop agent actions?

The answer should not be defensive. The message is:

> Sero gives agents real working surfaces, with local-first control and visible approval points.

Trust requirements before broad launch:

- README includes a short security and privacy section.
- Homepage includes a plain local-first statement.
- Public copy states that packaged desktop builds are code-signed.
- Public copy positions Sero as a power-user tool and points at the existing in-product warnings and documentation, rather than pretending the power surfaces do not exist.
- Demo videos show approval points for plugin installation, loop activation, external posting, and destructive actions.
- Growth and social loops produce drafts by default. They do not post automatically.
- Beta caveats are visible and specific.

## Core positioning

### Main category

Sero is an AI agent workplace.

This should feel broader than a project wrapper and more concrete than a generic assistant. Sero is the place where agent workflows live across projects, tools, browsers, terminals, plugins, project memory, automation, release work, research, and maintenance.

### Flagship tagline

> Sero is where AI agents come to work.

### Homepage hero

Hero headline:

> Stop chatting with agents. Put them to work.

Hero subheading:

> Sero is a local-first desktop workspace where AI agents can see, act, remember, automate, and extend themselves across your software life.

Primary CTA:

> Download the beta

Secondary CTAs:

> Watch the demo  
> Star on GitHub

### GitHub description

Use this in the GitHub repository About box:

> Local-first desktop workspace for AI agents: browser, terminal, memory, plugins, runtimes, and durable loops.

### GitHub social preview

Use this copy on the social card:

> Sero  
> Where AI agents come to work

The image should sell the idea of an agent workplace, not just a code editor. It should show Sero as an environment with multiple surfaces: chat, browser, terminal, plugins, memory, and automation.

### Launch hook

Use this as the sharp social hook:

> Your agents are trapped in chat boxes. Sero lets them out.

Alternative launch hook:

> Stop chatting with agents. Put them to work.

Complement variant for audiences already using Claude Code, Cursor, Codex, or Pi (they like their tools; do not insult them):

> Your agents have outgrown the chat box.

Never use the "trapped" line in the Pi community or in replies to users of a specific agent tool. There it reads as an attack on their stack rather than an invitation.

Grounded technical variant for HN, Reddit, docs, and skeptical audiences:

> Agents need more than a prompt box: browser state, terminal output, files, memory, plugins, and long-running workflows.

The provocative hooks are valuable. Keep them. Just do not let them stand alone. Pair them with a demo or a concrete workflow every time.

### One-line pitch

> Sero is the local-first desktop workplace for AI agents.

### Slightly longer pitch

> Sero brings agents, browsers, terminals, previews, plugins, memory, runtimes, and long-running workflows into one local-first desktop workspace.

### Founder-style pitch

> Terminal agents are powerful, but real software work is not just terminal text. It spans code, browser state, screenshots, local services, Git, memory, tools, plugins, and recurring workflows. Sero gives agents a real place to work.

### Positioning rules

Do:

- Make Sero feel like a place where agents work.
- Lead with outcomes and proof moments.
- Use broad but concrete language: workplace, workspace, agents, loops, memory, browser, plugins.
- Show the agent acting across surfaces, not just editing a repo.
- Emphasise local-first control without making the message sound defensive.

Do not:

- Lead with a list of features.
- Overuse "desktop cockpit" as the core pitch.
- Make Sero sound like a wrapper around one repo.
- Make Sero sound like a generic personal assistant.
- Compare directly to OpenClaw unless the comparison clarifies categories.
- Attack the tools Sero's target users already rely on. Frame Sero as the next step for Claude Code, Cursor, Codex, and Pi workflows, not a replacement.

### Internal comparison positioning

Do not lead public launches with named competitor comparisons. They can make Sero look reactive and can pull the conversation away from the product.

Use comparison positioning internally, in sales-style replies, or when someone directly asks how Sero differs.

- OpenClaw: personal assistant.
- OpenHands: cloud or app coding agent environment.
- Cursor: AI editor.
- Claude Code or Codex CLI: terminal coding agent.
- Sero: the local-first workplace where AI agents come to work.

Public default:

> Agents need more than a prompt box. They need browser state, terminal output, files, memory, plugins, and durable workflows in one local-first workspace.

## Viral angle

The first campaign should be based on this line:

> I built an AI workspace that can extend itself.

This works because it connects directly to Sero's self-building plugin story.

The flagship demo should be:

> I asked Sero to build itself a release manager.

Safer public phrasing:

> I asked Sero to build a release checklist plugin, reviewed it, and ran it inside Sero.

In a 60 to 90 second clip:

1. Ask Sero for a release-checklist plugin or Orchestrator loop.
2. Sero creates the plugin or loop.
3. The human reviews and approves the new plugin or loop.
4. The UI appears inside Sero.
5. It checks repo state, tests, changelog, release notes, and open PRs.
6. It produces a release readiness report or opens a PR after approval.

This is the first proof moment because it shows the product thesis instantly. The approval step matters because "self-extending workspace" is exciting, but "uncontrolled agent modifies itself" is an avoidable trust problem.

## Six proof demos

The campaign needs six repeatable demos rather than endless announcements.

### Demo 1: Sero builds itself a plugin

Hook:

> I asked my AI workspace to add a feature to itself.

Show:

- prompt
- agent work
- plugin files
- review and approval step
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
- approval before external side effects
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

### Demo 6: Zero to first workflow

Hook:

> From download to a working agent workspace in ten minutes.

Show:

- download and open the signed beta build
- connect a model: hosted API key or local OpenAI-compatible server (Ollama, LM Studio, vLLM)
- first useful workflow completes
- honest total elapsed time

This is the boring demo on purpose. The other demos create desire; this one removes the last objection before download, and it backs the 10-minute quick-start claim. Re-record it whenever onboarding changes.

## 1000-star campaign structure

Run the campaign as three bursts over eight weeks. The schedule should be paced around asset quality, not arbitrary posting volume. One excellent flagship demo is worth more than five rushed clips.

One channel dominates the math: a front-page Show HN can deliver most of the 1,000-star goal on its own, while every other channel on the list yields tens of stars. Treat weeks 1 to 4 as rehearsal and surface-hardening for the HN launch, not as ends in themselves.

### Phase 1: Conversion hardening

Timing: first 3 to 5 days.

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
- Add security, privacy, and approval-point notes.
- State model requirements and approximate flagship-demo cost in the quick start.
- Confirm repo hygiene: visible LICENSE, CONTRIBUTING guide, issue templates, CI badge.
- Add a "get beta updates" email capture to the homepage as the one owned channel.
- Start weekly snapshots of GitHub traffic and referrer data (GitHub only retains 14 days; use-it-or-lose-it).

Success criteria:

- A first-time visitor can understand Sero in 10 seconds.
- A developer can try Sero in 10 minutes.
- A social share has a strong preview card.

### Phase 2: Proof series

Timing: week 1 to week 4.

Publish the flagship proof demo first. Then cut it into shorter posts and use the remaining proof demos as a paced series — but hold back at least one strong demo so the HN launch still has something that feels new.

Each demo should become:

- one short video
- one X post
- one longer X thread
- one Discord post only if there is a clear feedback ask
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
2. AI agent workplace workflows.
3. Visual browser and agent feedback loops.
4. Orchestrator loops.
5. Plugin ecosystem.
6. Honest beta devlogs.
7. Comparisons that clarify categories, not drama.

Daily X rhythm:

- 1 original post or short build log.
- 5 to 10 high-quality replies to relevant discussions.
- 1 quote post only when the Sero angle adds substance.

Tone rule:

> Be opinionated enough to be noticed, but specific enough to be trusted.

Strong claims are allowed. Avoid vague hype. A controversial post should point to a demo, a real workflow, or a clear product belief.

Example X post:

```text
Your agents are trapped in chat boxes.

Real software work is browser state, screenshots, local services, files, Git, logs, memory, plugins, and long-running workflows.

That is why I am building Sero: the place where AI agents come to work.

Demo below.
```

Example star ask:

```text
Sero is still tiny as an OSS project, but I think this direction matters.

If a local-first workplace for AI agents sounds useful, starring the repo genuinely helps more developers find it.
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

Title: keep it plain and descriptive. HN strips or punishes marketing titles.

- Show HN: Sero, a local-first desktop workspace for AI agents

Save "where AI agents come to work" and "extends itself" for the body text and comments, not the title.

HN launch checklist:

- demo video embedded or linked
- clear install path
- honest beta caveats
- architecture docs linked
- no overclaiming
- founder present in comments all day
- pre-written answers to the obvious security objections (self-extending workspace, terminal and file access), grounded in the power-user positioning, signed builds, approval points, and the existing in-product warnings and docs

Hard launch gates before posting:

- packaged desktop build works on every platform named in the README
- a new user can complete the quick start in 10 minutes
- README and homepage use the same release status
- the flagship demo is repeatable live, or clearly labeled as a timelapse with the real duration stated
- trust and safety notes answer the obvious permissions questions
- at least one person outside the core project has tried the install path

### Reddit

Use different angles per subreddit.

Potential communities:

- `r/LocalLLaMA`: lead with local OpenAI-compatible model support (Ollama, LM Studio, vLLM presets). Verify the flagship demo runs well against a local model before posting — this audience will test the local claim in the first hour.
- `r/selfhosted`: local control and non-SaaS posture.
- `r/programming`: agent workplace and developer tooling.
- `r/opensource`: contributor and ecosystem story.
- `r/electronjs`: Electron desktop architecture and plugin UI.

Avoid dumping the same post everywhere.

Account prep matters: most of these subreddits filter low-karma accounts and are hostile to self-promotion. Whoever posts needs an account with organic history in that community first.

For Reddit, lead with the practical problem rather than the slogan. The sharper "agents are trapped in chat boxes" line can appear in the post, but the title and first paragraph should make the technical value clear.

### Newsletters and creators

Target smaller AI engineering newsletters before major outlets.

Pitch angle:

> Sero is an open-source local-first desktop workplace for AI agents. The interesting bit is that it can build and use its own plugins and durable loops.

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

Gate before opening the challenge: the plugin developer guide must be complete and verified against the current API. The API surface is stable; the docs are the gate. An early builder who hits a wrong doc on day one does not come back.

## Sero Growth Loop Catalog

This is a strong product-aligned growth idea, but it should not become the public launch story too early. People need to understand Sero before they care that Sero can help market itself.

Start by running these loops internally or as local drafts. Create a separate repository only after the flagship demo, README, homepage, and install path are strong:

> `sero-labs/sero-growth-catalog`

Do not put these into the official catalog until they are proven, useful, and safe.

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

Public rule:

> Do not promote the growth catalog as the main launch asset. Use it as a supporting proof point after people already understand the product.

## Initial launch pack

### Launch title

> Sero: where AI agents come to work

### Launch story

1. Agents are powerful, but most of them are trapped in chat boxes or terminals.
2. Real software work spans code, terminal, browser, previews, Git, memory, tools, plugins, and long-running workflows.
3. Sero gives agents a real local-first workspace where those surfaces live together.
4. The twist: Sero can extend itself with reviewed plugins and durable loops.
5. It is early, but packaged beta builds are available for the named release platforms, and developers can run from source.

### Launch assets

- 60 to 90 second flagship demo.
- 6 proof clips (hold at least one back for the HN launch).
- README hero GIF.
- GitHub social preview.
- Homepage hero update.
- Trust, privacy, and beta caveats.
- HN launch post.
- Reddit variants.
- X thread.
- Discord feedback post.
- Contributor challenge issue.

## Launch readiness gates

Do not push for broad distribution until these are true:

- The packaged desktop build works on every platform named publicly.
- The README has a clear quick start and top-of-page proof moment.
- The homepage and README say the same thing about beta status and downloads.
- The flagship demo is repeatable live, or clearly labeled as a timelapse with the real duration stated.
- The quick start names model requirements (hosted API key or local OpenAI-compatible server) and the approximate cost of the flagship workflow.
- The plugin developer guide is complete and verified before the builder challenge opens.
- The trust and safety section answers the obvious local-first, permissions, plugin, credential, and loop questions.
- The first call-to-action is obvious: download, star, watch demo, or run from source.
- A new user can understand Sero in 10 seconds and try it in 10 minutes.
- At least one external tester has completed the install path.

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
- Weekly snapshot of GitHub traffic and referrer data (GitHub retains only 14 days — capture it via the star-dashboard loop from day one).

Track the funnel, not just the top-line star count:

1. Saw a demo.
2. Clicked through to GitHub or homepage.
3. Starred the repo.
4. Downloaded a build or cloned the repo.
5. Opened Sero successfully.
6. Completed the first useful workflow.
7. Joined Discord, opened an issue, commented, or built a plugin or loop.

Before 1,000 stars, stars are a visibility metric. Successful first run is the activation metric.

North star metric before 1,000 stars:

> Number of developers who see a demo and then visit or star the repo.

That join cannot be measured directly (X does not provide it). Use proxies and say so in reporting: GitHub referrer traffic snapshots, link clicks where available, and star delta in the 48 hours after each post.

North star metric after 1,000 stars:

> Number of developers who install Sero and build or run a plugin or loop.

## Things to stop doing

- Stop posting generic AI news from the Sero account.
- Stop explaining architecture before showing proof.
- Stop using broad positioning such as "advanced open-source AI personal workspace" as the main message.
- Stop relying on Discord as the main discovery channel.
- Stop making OpenClaw the central comparison.
- Stop sending people to surfaces that contradict each other on release status.
- Stop using language that implies Sero is just a single project or repo wrapper.
- Stop letting clever growth loops distract from the core product proof.
- Stop hiding approval, safety, and beta limitations until after people ask.

## Immediate action plan

### Days 1 to 3

- Update GitHub repo description, website, and topics.
- Create social preview image with "Where AI agents come to work".
- Fix homepage release-status wording.
- Replace homepage hero with the new positioning.
- Check release naming and latest release clarity.
- Name the packaged release platforms directly.
- Add README and homepage trust notes (including that builds are code-signed).
- Confirm repo hygiene: LICENSE, CONTRIBUTING, issue templates, CI badge.
- Add homepage email capture for beta updates.
- Start weekly GitHub traffic and referrer snapshots.
- Test the install path with someone outside the core project if possible.

### Days 4 to 6

- Record flagship demo: Sero builds itself a plugin or loop.
- Make review and approval points visible in the demo.
- Record the zero-to-first-workflow demo (Demo 6) alongside it.
- Add demo GIF or video link to README.
- Add quick-start CTA near top of README, with model requirements and cost stated.
- Update README intro to use the new positioning.

### Week 2

- Publish the flagship proof post on X.
- Cut the flagship demo into smaller follow-up posts.
- Post one Pi-community feedback request.
- Verify the plugin developer guide against the current API, then open the `Sero 100 Early Builders` discussion.
- Create labels for `good first plugin` and `good first loop`.
- Draft HN launch post, but do not publish until conversion surfaces are ready.

### Weeks 3 to 4

- Publish the remaining proof demos at a sustainable pace.
- Run the first growth loops internally or as local drafts.
- Create `sero-growth-catalog` only if the launch surfaces are already strong.
- Add the first five draft/report loops.
- Run the growth dashboard loop manually.
- Publish first weekly builder log.

### Weeks 5 to 8

- Launch on HN after the hard launch gates are met.
- Publish subreddit-specific posts.
- Submit to relevant awesome lists.
- Contact smaller AI engineering newsletters.
- Keep publishing weekly demo clips.
- Feature contributors and early builders.

## Decision to agree before expanding

The proposed campaign is built around this positioning:

> Sero should become known as the place where AI agents come to work.

The tone should be provocative, not boring, but the proof should be concrete and the approval model should be visible.

If this is accepted, the next planning step should be to produce:

1. exact README changes,
2. homepage copy changes,
3. trust and safety copy,
4. social preview concept,
5. flagship demo script,
6. X launch thread,
7. HN launch draft,
8. `sero-growth-catalog` repository structure,
9. first five loop definitions.

## Reference links

- Sero repo: https://github.com/sero-labs/sero
- Sero homepage: https://sero-ai.dev/
- Sero docs: https://docs.sero-ai.dev/
- Sero official loop catalog: https://github.com/sero-labs/orchestrator-catalog
- OpenClaw repo: https://github.com/openclaw/openclaw
- GitHub topics docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
- GitHub social preview docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview
