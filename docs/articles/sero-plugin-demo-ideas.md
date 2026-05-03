# Sero Plugin Demo Ideas

Simplish but eye-catching plugin ideas for the Sero OSS alpha launch.

## Top picks

### 1. Agent Flight Recorder

A visual timeline of what the agent did in a session.

Shows:

- prompts
- tool calls
- file edits
- commands
- errors
- checkpoints

Why it demos well: instantly communicates “Sero is not just chat — it’s an agent workspace.”

Plugin surfaces:

- UI timeline
- tool/command: `/flight summarize`
- optional widget: “last session activity”

---

### 2. Project Pulse

A dashboard card that shows the current health of a workspace.

Metrics:

- git dirty files
- failing tests
- latest commits
- TODO/FIXME count
- package scripts
- dev server status

Why it demos well: looks useful immediately and gives Sero a “mission control” feel.

Plugin surfaces:

- dashboard UI
- tool: `project_pulse`
- no runtime needed unless watching files live

---

### 3. Launch Checklist

A beautiful release checklist for OSS/project launches.

Sections:

- README
- screenshots
- docs
- changelog
- license
- tests
- social posts
- package metadata
- known issues

Agent can run checks and mark items complete.

Why it demos well: perfect for the Sero alpha launch itself.

Plugin surfaces:

- checklist UI
- tool: `launch_checklist scan`
- command: `sero launch-check`

---

### 4. Screenshot Wall

A plugin that collects screenshots from browser/dev-server runs into a gallery.

Features:

- image grid
- captions
- “compare before/after”
- agent notes per screenshot
- export as launch assets

Why it demos well: highly visual, simple state model, immediately shareable.

Plugin surfaces:

- UI gallery
- tool: `screenshot_wall add`
- optional command: `/shots`

---

### 5. Context Cards

A plugin where the agent can create persistent “cards” about the project.

Examples:

- Architecture
- Run commands
- Known bugs
- Design direction
- Release goals
- Decisions

Why it demos well: makes memory tangible instead of invisible.

Plugin surfaces:

- bento/card UI
- tools: `context_card create/update/search`
- widget: “pinned context”

---

## More eye-catching ideas

### 6. Agent Kanban Lite

A tiny task board generated and updated by the agent.

Columns:

- Backlog
- Doing
- Review
- Done

Why: very easy to understand in screenshots.

Avoid making it too big. Keep it “lite” and polished.

---

### 7. Repo Constellation

A visual map of important files/modules in the repo.

Agent scans the project and creates nodes like:

- app shell
- IPC layer
- plugin runtime
- UI package
- docs site

Why: visually memorable, great for explaining unfamiliar codebases.

---

### 8. Prompt Studio

A small UI for saving, tagging, and running reusable prompts.

Examples:

- “Review this file”
- “Write release notes”
- “Generate screenshots checklist”
- “Find risky TODOs”

Why: practical and very demoable.

---

### 9. Changelog Composer

Agent reads commits/diffs and drafts a changelog.

UI:

- unreleased changes
- grouped by feature/fix/docs
- editable generated notes
- copy-to-markdown button

Why: simple but useful for OSS maintainers.

---

### 10. Bug Jar

A cute issue-capture plugin.

Agent or user can drop:

- bug title
- screenshot
- reproduction steps
- severity
- file links
- status

Why: playful, visual, low complexity.

---

### 11. Dev Server Radar

Shows detected/running dev servers as animated cards.

Each card:

- port
- URL
- status
- last screenshot
- open preview
- copy URL

Why: makes Sero’s workspace/runtime story visible.

---

### 12. OSS Contributor Welcome

A plugin that helps new contributors orient themselves.

Agent generates:

- “Start here” guide
- good first files
- commands to run
- contribution checklist
- architecture map
- suggested first issues

Why: very aligned with OSS alpha launch.

---

## Recommended launch set

If building 2–3 strong demos:

1. **Launch Checklist** — directly relevant to alpha launch
2. **Screenshot Wall** — visual and shareable
3. **Agent Flight Recorder** — proves Sero’s agent-native workspace thesis

Together they show:

- practical workflow
- visual UI
- agent/tool integration
- persistent workspace state
- why Sero is more than a chat panel
