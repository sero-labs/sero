# Demo Workspace and Screenshot Ideas

Profile for the screenshot pass:

```text
/Users/danielcarter/.sero-ui/profiles/serodemo
```

The goal is to make Sero look alive without exposing real data or implying unsupported guarantees.

## Recommended demo setup

Use **2–3 synthetic workspaces** instead of one giant fake project.

### 1. `phoenix-shop` — best main showcase workspace

A small TypeScript/React-ish product app.

Use for screenshots of:

- Explorer Workspace
- Workspace and Chat
- Git Manager
- Web Access research
- Scheduler jobs
- Memory workflow

Suggested path:

```text
~/SeroDemo/phoenix-shop
```

Concept:

> A fictional local commerce dashboard for “Phoenix Supply Co.”

Good because it naturally creates files, TODOs, commits, UI previews, docs, branches, and agent tasks.

### 2. `atlas-notes` — lightweight knowledge/workflow workspace

A markdown/docs-heavy workspace.

Use for:

- Memory
- Web Access
- scheduler/reminder screenshots
- chat/session examples

Suggested path:

```text
~/SeroDemo/atlas-notes
```

Concept:

> A fictional product-research notebook for planning a docs launch.

Good because screenshots can show notes, research summaries, and bookmarks without needing a running app.

### 3. `plugin-lab` — plugin/app-store showcase workspace

A tiny plugin-authoring sandbox.

Use for:

- Plugin Author Quick Path
- App Store/Favorites
- Plugins and Apps
- terminal/editor split

Suggested path:

```text
~/SeroDemo/plugin-lab
```

Concept:

> A fake “Daily Standup” plugin experiment with shared state and a simple UI stub.

Good because it pairs nicely with the plugin docs.

## Workspace/session ideas

## Workspace: `phoenix-shop`

### Files to create

```text
phoenix-shop/
├── README.md
├── package.json
├── src/
│   ├── App.tsx
│   ├── data/products.ts
│   ├── lib/pricing.ts
│   └── styles.css
├── docs/
│   ├── launch-plan.md
│   ├── qa-checklist.md
│   └── customer-notes.md
├── scripts/
│   └── seed-demo-data.ts
└── tests/
    └── pricing.test.ts
```

### Example content themes

Use safe fake content:

- Product names:
  - Ember Desk Lamp
  - Copper Field Notebook
  - Nomad Cable Kit
  - Solstice Mug
- Fake customer notes:
  - “Users want clearer shipping estimates.”
  - “Bundle discount copy should be less technical.”
- Fake launch goal:
  - “Prepare the dashboard for a spring demo.”

### Good sessions to create

#### Session: `Polish the launch dashboard`

Prompt ideas:

```text
Review the Phoenix Shop README and suggest a clean launch checklist for the demo.
```

```text
Look at src/data/products.ts and docs/launch-plan.md. What should we improve before showing this to stakeholders?
```

Screenshot value:

- Explorer file tree visible
- Chat has meaningful agent response
- Looks like a real project but safe

#### Session: `Investigate pricing bug`

Create a tiny bug in `src/lib/pricing.ts`, then ask:

```text
Check the pricing helper and test file. Why might the bundle discount be wrong?
```

Screenshot value:

- Good for Explorer + terminal + Git Manager
- Safe fake bug
- Can show changed files/diff

#### Session: `Prepare release notes`

Prompt:

```text
Summarize the changes in this workspace into short release notes for a demo build.
```

Screenshot value:

- Good for chat panel
- Can later pair with Git Manager status

## Workspace: `atlas-notes`

### Files to create

```text
atlas-notes/
├── README.md
├── notes/
│   ├── demo-brief.md
│   ├── research-questions.md
│   ├── meeting-summary.md
│   └── open-decisions.md
├── web/
│   ├── bookmarks.md
│   └── sources-to-review.md
└── schedule/
    ├── reminders.md
    └── weekly-review.md
```

### Good sessions to create

#### Session: `Build demo memory context`

Prompt:

```text
Remember that the demo workspace is fictional, uses synthetic data only, and the main project is Phoenix Shop.
```

Then:

```text
Add a scratchpad note: before screenshots, verify no real tokens, paths, or private customer names are visible.
```

Screenshot value:

- Perfect for Memory screenshot
- Demonstrates safety-aware memory
- No secrets

#### Session: `Research docs launch examples`

Prompt:

```text
Use web search to find public examples of clear developer-tool documentation homepages. Summarize three patterns we could borrow for Sero docs.
```

If provider setup works, this is a good Web Access demo.

Screenshot value:

- Shows web search history/bookmarks
- Safe public sources
- Looks useful

#### Session: `Plan weekly review reminders`

Prompt:

```text
Create a reminder for tomorrow at 9 AM to review the demo screenshots, and suggest a weekly docs review job.
```

Screenshot value:

- Good Scheduler/Reminders story
- Synthetic and harmless

## Workspace: `plugin-lab`

### Files to create

```text
plugin-lab/
├── README.md
├── package.json
├── shared/
│   └── types.ts
├── extension/
│   └── index.ts
├── ui/
│   ├── DailyStandupApp.tsx
│   └── styles.css
└── docs/
    ├── plugin-plan.md
    └── compatibility-notes.md
```

### Good sessions to create

#### Session: `Design a tiny plugin`

Prompt:

```text
Help me outline a tiny Sero plugin called Daily Standup. It should have shared state, a UI card, and one agent tool for adding a standup note.
```

Screenshot value:

- Great for Plugin Author Quick Path page context
- Shows Sero as extensible
- Does not require the plugin to actually run

#### Session: `Review plugin manifest`

Prompt:

```text
Review this package.json and tell me which Sero plugin manifest fields are still missing.
```

Screenshot value:

- Good for author/developer docs
- Can show package metadata in editor

# Specific screenshot concepts

## 1. Desktop shell overview

Use workspace:

```text
phoenix-shop
```

Open:

- Explorer active
- file tree expanded
- `docs/launch-plan.md` or `src/App.tsx` in editor
- chat panel open with session `Polish the launch dashboard`
- terminal panel open but not too tall

Good terminal content:

```bash
pnpm test
```

or:

```bash
git status
```

Avoid long noisy logs.

## 2. Explorer Workspace detail

Use:

```text
phoenix-shop
```

Open:

- file tree: `src/`, `docs/`, `tests/`
- editor: `src/App.tsx`
- bottom terminal:

```bash
pnpm test
```

Nice file content for `src/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Phoenix Shop Demo</h1>
      <p>Spring launch dashboard for synthetic product data.</p>
    </main>
  );
}
```

## 3. Memory workflow

Use:

```text
atlas-notes
```

Session:

```text
Build demo memory context
```

Good visible content:

```text
Remember that all screenshot data should be synthetic and that Phoenix Shop is the main demo workspace.
```

Then ask:

```text
What should I double-check before capturing launch screenshots?
```

Ideal screenshot:

- chat response mentions synthetic data, no tokens, no private paths
- memory context block visible if available

## 4. Web Access

Use:

```text
atlas-notes
```

Search topic:

```text
developer documentation homepage examples
```

Bookmark safe pages like:

- React docs
- Vite docs
- Tailwind docs
- Electron docs
- GitHub Docs

Good screenshot:

- Web app with History list
- Bookmarks list
- no private sources

Avoid:

- real browsing history
- logged-in web apps
- internal docs
- query strings with tokens

## 5. Scheduler and Reminders

Use synthetic tasks.

### Reminders

```text
Review screenshot redaction checklist
```

```text
Capture App Store favorites screenshot
```

```text
Check docs-site build before launch
```

### Jobs

```text
Daily demo workspace health check
```

Description:

```text
Summarize open demo tasks and verify the screenshot workspace still uses synthetic data.
```

Good screenshot:

- one scheduled job
- two reminders
- notification settings visible if possible

## 6. Git Manager

Use:

```text
phoenix-shop
```

Create safe changes:

```bash
echo "- Add screenshot checklist" >> docs/qa-checklist.md
git checkout -b demo/docs-polish
```

Good visible Git state:

- branch: `demo/docs-polish`
- modified file: `docs/qa-checklist.md`
- maybe staged file
- clear diff with safe text

Good session:

```text
Review the current git diff and suggest a concise commit message.
```

Avoid pushing anywhere real.

## 7. App Store / Favorites

Goal:

Show:

- core apps
- bundled plugin apps
- favorites
- App Store Installed/Discover distinction

Good app/favorite set:

- Dashboard
- Explorer
- Git
- Scheduler
- Web
- Admin maybe visible, but avoid sensitive Admin panels
- App Store dialog open

If Discover has external plugins, avoid implying they are endorsed. Prefer a screenshot showing installed/favorites rather than a marketplace-like catalog if worried.

## 8. Web Remote

Only capture if safe.

Use local-only pairing if possible.

Good story:

- Sero desktop running
- Web Remote page paired to synthetic workspace
- harmless prompt:

```text
Summarize the Phoenix Shop demo workspace.
```

Avoid showing:

- gateway token
- QR code if it embeds a token
- login URL
- real IP/hostnames
- Discord/Tailscale details

This is optional. If unsafe, skip screenshot.

# Synthetic data examples

## Fake project names

- Phoenix Shop
- Atlas Notes
- Northstar Demo
- Copperline Studio
- Meadow CRM
- Orbit Docs

## Fake people

- Avery Chen
- Morgan Lee
- Riley Stone
- Casey Hart

## Fake company names

- Phoenix Supply Co.
- Atlas Labs Demo
- Northstar Widgets
- Copperline Studio

## Fake tasks

- Review screenshot checklist
- Polish launch dashboard copy
- Verify reminder delivery
- Summarize demo workspace
- Prepare release note draft
- Check App Store favorites

## Fake memory entries

- “The demo profile must only contain synthetic data.”
- “Phoenix Shop is the primary screenshot workspace.”
- “Use Atlas Notes for research and scheduling examples.”
- “Avoid showing tokens, real paths, or private browser history.”

# Suggested final screenshot set

If you want the fewest screenshots with maximum coverage, capture these 6:

1. **Desktop shell overview**
   - `phoenix-shop`, Explorer active, chat open
2. **Explorer Workspace**
   - file tree + editor + terminal
3. **Memory workflow**
   - synthetic memory reminder/checklist in chat
4. **Web Access**
   - History + Bookmarks with public docs sources
5. **Scheduler**
   - jobs/reminders with synthetic entries
6. **App Store/Favorites**
   - installed/favorited plugin apps

Optional extras:

7. Git Manager
8. Web Remote
9. Scheduler widget

# Quick path to make this look good

1. Create the folders under:

```bash
mkdir -p ~/SeroDemo/phoenix-shop ~/SeroDemo/atlas-notes ~/SeroDemo/plugin-lab
```

2. Populate each with small fake files.

3. Open all three as Sero workspaces in the `serodemo` profile.

4. Create these sessions:

```text
phoenix-shop / Polish the launch dashboard
phoenix-shop / Investigate pricing bug
atlas-notes / Build demo memory context
atlas-notes / Research docs launch examples
atlas-notes / Plan weekly review reminders
plugin-lab / Design a tiny plugin
```

5. Pin/favorite useful apps:

- Explorer
- Web
- Scheduler
- Git
- App Store/Favorites state

6. Capture screenshots in this order:

```text
Desktop shell → Explorer → Memory → Web → Scheduler → App Store → Git optional
```

That gives a coherent, polished screenshot story without relying on real data.

# Copy/paste Sero prompts to generate the demo workspaces

Use these prompts inside Sero after opening the corresponding empty workspace. They are designed to create synthetic, screenshot-safe files and sessions without real credentials, private paths, or customer data.

## Prompt for `phoenix-shop`

Run this in an empty workspace at:

```text
~/SeroDemo/phoenix-shop
```

Recommended session name:

```text
Polish the launch dashboard
```

Prompt:

```text
Create a small synthetic demo project called Phoenix Shop for Sero documentation screenshots.

Important constraints:
- Use only fake/synthetic data.
- Do not include real API keys, tokens, real URLs, private paths, real emails, or real customer names.
- Keep files small and readable in screenshots.
- Make the project feel like a believable local TypeScript/React product dashboard, but it does not need to run perfectly.
- Prefer clear filenames and concise content over completeness.

Create this file structure:

phoenix-shop/
├── README.md
├── package.json
├── src/
│   ├── App.tsx
│   ├── data/products.ts
│   ├── lib/pricing.ts
│   └── styles.css
├── docs/
│   ├── launch-plan.md
│   ├── qa-checklist.md
│   └── customer-notes.md
├── scripts/
│   └── seed-demo-data.ts
└── tests/
    └── pricing.test.ts

Content requirements:
- README.md should describe Phoenix Shop as a fictional spring launch dashboard for Phoenix Supply Co.
- src/App.tsx should render a simple dashboard with a heading, launch status, a few product cards, and a short checklist.
- src/data/products.ts should export fake products: Ember Desk Lamp, Copper Field Notebook, Nomad Cable Kit, Solstice Mug.
- src/lib/pricing.ts should include a simple subtotal/discount helper. Leave one small obvious TODO or edge-case note so the Git/diff screenshot has something plausible.
- tests/pricing.test.ts should include a couple of lightweight tests or pseudo-tests for the pricing helper.
- docs/launch-plan.md should have sections: Goals, Demo Scope, Risks, Screenshot Checklist.
- docs/qa-checklist.md should have checkboxes for demo readiness.
- docs/customer-notes.md should contain only synthetic feedback from fake people: Avery Chen, Morgan Lee, Riley Stone, Casey Hart.
- scripts/seed-demo-data.ts should be a small illustrative script with fake data only.

After creating files:
1. Initialize a git repo if one does not already exist.
2. Create an initial commit with message: "chore: create phoenix shop demo".
3. Create a branch named `demo/docs-polish`.
4. Add one small uncommitted change to docs/qa-checklist.md: add a checkbox for "Verify screenshots contain synthetic data only".
5. Show me a concise summary of what you created and suggest 3 screenshot moments from this workspace.
```

Follow-up prompts for `phoenix-shop` sessions:

```text
Review the Phoenix Shop README and docs/launch-plan.md. Suggest a clean launch checklist for the demo, keeping it concise enough to show in a screenshot.
```

```text
Check src/lib/pricing.ts and tests/pricing.test.ts. Why might the bundle discount need one more edge-case test?
```

```text
Review the current git diff and suggest a concise commit message. Do not commit yet.
```

## Prompt for `atlas-notes`

Run this in an empty workspace at:

```text
~/SeroDemo/atlas-notes
```

Recommended session name:

```text
Build demo memory context
```

Prompt:

```text
Create a lightweight synthetic notes workspace called Atlas Notes for Sero documentation screenshots.

Important constraints:
- Use only synthetic data.
- Do not include real API keys, tokens, internal URLs, private paths, real browsing history, real customer names, or real emails.
- Make the notes useful for Memory, Web Access, Scheduler, and workspace/chat screenshots.
- Keep the content short and readable.

Create this file structure:

atlas-notes/
├── README.md
├── notes/
│   ├── demo-brief.md
│   ├── research-questions.md
│   ├── meeting-summary.md
│   └── open-decisions.md
├── web/
│   ├── bookmarks.md
│   └── sources-to-review.md
└── schedule/
    ├── reminders.md
    └── weekly-review.md

Content requirements:
- README.md should explain that Atlas Notes is a fake product-research notebook for planning Sero docs screenshots.
- notes/demo-brief.md should describe the screenshot story: Phoenix Shop is the main project, Atlas Notes is the planning/research workspace, Plugin Lab is the authoring sandbox.
- notes/research-questions.md should list safe public research questions about developer-tool docs homepages, onboarding, and screenshots.
- notes/meeting-summary.md should contain a fake meeting summary with fake participants Avery, Morgan, Riley, and Casey.
- notes/open-decisions.md should list decisions like screenshot order, whether to include Web Remote, and what to defer.
- web/bookmarks.md should list safe public docs sources to bookmark: React docs, Vite docs, Tailwind docs, Electron docs, GitHub Docs.
- web/sources-to-review.md should include suggested non-sensitive search queries.
- schedule/reminders.md should include synthetic reminders for screenshot review, redaction pass, and docs-site build check.
- schedule/weekly-review.md should outline a fictional weekly docs review job.

After creating files:
1. Initialize a git repo if one does not already exist.
2. Create an initial commit with message: "chore: create atlas notes demo".
3. Show me a concise summary and suggest which file to open for a Memory screenshot.
```

Follow-up prompts for `atlas-notes` sessions:

```text
Remember that the demo profile must only contain synthetic data, Phoenix Shop is the primary screenshot workspace, Atlas Notes is for research and scheduling examples, and Plugin Lab is for plugin-author screenshots.
```

```text
Add a scratchpad note: before screenshots, verify no real tokens, private paths, browser history, account names, or customer data are visible.
```

```text
What should I double-check before capturing launch screenshots? Answer as a short redaction checklist.
```

```text
Use web search to find public examples of clear developer-tool documentation homepages. Summarize three patterns we could borrow for Sero docs. Use only public documentation websites.
```

```text
Create a reminder for tomorrow at 9 AM to review the demo screenshots, and suggest a weekly docs review job. Use synthetic wording only.
```

## Prompt for `plugin-lab`

Run this in an empty workspace at:

```text
~/SeroDemo/plugin-lab
```

Recommended session name:

```text
Design a tiny plugin
```

Prompt:

```text
Create a small synthetic plugin-authoring sandbox called Plugin Lab for Sero documentation screenshots.

Important constraints:
- Use only fake/synthetic data.
- This is a documentation demo, not a production plugin.
- Do not include real API keys, tokens, private package names, internal URLs, or real user data.
- Keep files small and readable in Explorer screenshots.
- Make the structure resemble a Sero plugin enough to support Plugin Author Quick Path screenshots, but avoid claiming it is complete or ready to publish.

Create this file structure:

plugin-lab/
├── README.md
├── package.json
├── shared/
│   └── types.ts
├── extension/
│   └── index.ts
├── ui/
│   ├── DailyStandupApp.tsx
│   └── styles.css
└── docs/
    ├── plugin-plan.md
    └── compatibility-notes.md

Content requirements:
- README.md should describe a fictional "Daily Standup" Sero plugin concept.
- package.json should be illustrative and clearly marked as a demo. Include plausible `pi.extensions`, `sero.app`, and `sero.plugin` fields, but avoid pretending it is published.
- shared/types.ts should define a JSON-serialisable DailyStandupState and DEFAULT_STATE.
- extension/index.ts should contain a small illustrative Pi extension skeleton with a fake `standup_add_note` tool. It can be pseudo-code if needed, but keep it TypeScript-looking and readable.
- ui/DailyStandupApp.tsx should show a simple React component using `useAppInfo` and `useAppState` from `@sero-ai/app-runtime`.
- ui/styles.css should contain minimal styles.
- docs/plugin-plan.md should explain extension, UI, shared state, and optional widget ideas.
- docs/compatibility-notes.md should mention alpha caveats: requiredHostCapabilities, file-backed app state, no localStorage, and production `base: './'`.

After creating files:
1. Initialize a git repo if one does not already exist.
2. Create an initial commit with message: "chore: create plugin lab demo".
3. Add one small uncommitted TODO to docs/plugin-plan.md about verifying host capabilities before publishing.
4. Show me a concise summary and suggest which files to open for Plugin Author Quick Path screenshots.
```

Follow-up prompts for `plugin-lab` sessions:

```text
Help me outline a tiny Sero plugin called Daily Standup. It should have shared state, a UI card, and one agent tool for adding a standup note. Keep the answer screenshot-friendly.
```

```text
Review this package.json and tell me which Sero plugin manifest fields are most important for an alpha plugin author to understand.
```

```text
Review the DailyStandupApp.tsx file and explain how it uses file-backed app state instead of browser localStorage.
```

## One-shot prompt if you want Sero to create all three workspaces from a parent folder

Run this from a parent workspace/folder such as:

```text
~/SeroDemo
```

Prompt:

```text
Create three synthetic demo workspaces for Sero documentation screenshots under the current folder:

1. phoenix-shop — fictional TypeScript/React commerce dashboard for Phoenix Supply Co.
2. atlas-notes — fictional markdown research/planning notebook for docs launch screenshots.
3. plugin-lab — fictional Sero plugin-authoring sandbox for a Daily Standup plugin concept.

Critical constraints:
- Use only fake/synthetic data.
- Do not include real API keys, tokens, OAuth values, real emails, private URLs, internal domains, private local paths, or real customer names.
- Keep files concise and screenshot-readable.
- Each workspace should be plausible but small.
- Initialize a separate git repo in each workspace and create one initial commit per workspace.
- Leave one small uncommitted, screenshot-safe change in phoenix-shop and plugin-lab so Git Manager can show a diff.

For phoenix-shop, create:
- README.md
- package.json
- src/App.tsx
- src/data/products.ts
- src/lib/pricing.ts
- src/styles.css
- docs/launch-plan.md
- docs/qa-checklist.md
- docs/customer-notes.md
- scripts/seed-demo-data.ts
- tests/pricing.test.ts

For atlas-notes, create:
- README.md
- notes/demo-brief.md
- notes/research-questions.md
- notes/meeting-summary.md
- notes/open-decisions.md
- web/bookmarks.md
- web/sources-to-review.md
- schedule/reminders.md
- schedule/weekly-review.md

For plugin-lab, create:
- README.md
- package.json
- shared/types.ts
- extension/index.ts
- ui/DailyStandupApp.tsx
- ui/styles.css
- docs/plugin-plan.md
- docs/compatibility-notes.md

After creating everything:
1. Print a tree of the created files.
2. Print the git status for each workspace.
3. Suggest the best file/session combinations for screenshots.
4. Remind me to open the workspaces in the serodemo profile and verify all screenshots are free of sensitive data.
```

## Prompt for setting up screenshot-oriented sessions after files exist

Run this in Sero after the workspaces exist and are added to the `serodemo` profile:

```text
Help me set up screenshot-friendly Sero sessions for these synthetic demo workspaces:

- phoenix-shop
- atlas-notes
- plugin-lab

Create a concise plan for the following sessions, including the first prompt I should send in each one:

1. phoenix-shop / Polish the launch dashboard
2. phoenix-shop / Investigate pricing bug
3. phoenix-shop / Prepare release notes
4. atlas-notes / Build demo memory context
5. atlas-notes / Research docs launch examples
6. atlas-notes / Plan weekly review reminders
7. plugin-lab / Design a tiny plugin
8. plugin-lab / Review plugin manifest

Constraints:
- Keep all prompts synthetic and screenshot-safe.
- Avoid real provider credentials, private URLs, real people, or private repo names.
- Prefer prompts that produce short, readable responses suitable for screenshots.
- For each session, tell me which app surface would make the best screenshot: Explorer, Chat, Web, Scheduler, Git, or App Store.
```
