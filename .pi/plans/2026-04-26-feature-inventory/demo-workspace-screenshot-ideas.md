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
