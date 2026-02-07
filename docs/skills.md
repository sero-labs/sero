# Skills Integration

Sero's skill system is built directly on the Pi SDK's skill primitives. It reuses Pi's discovery and prompt-formatting logic verbatim, and adds a GUI management layer with per-project enable/disable configuration on top.

## Relationship to Pi

Three exports from the Pi SDK form the entire interface:

```typescript
// electron/skill-manager.ts
import { loadSkillsFromDir, formatSkillsForPrompt, type Skill } from '@mariozechner/pi-coding-agent';
```

| Pi SDK Export | What It Does |
|---|---|
| `Skill` | Type: `{ name, description, filePath, baseDir, source, disableModelInvocation }` |
| `loadSkillsFromDir({ dir, source })` | Scans a directory for `SKILL.md` files (direct `.md` in root + recursive `SKILL.md` in subdirs), parses YAML frontmatter, validates against the [Agent Skills spec](https://agentskills.io/specification), returns `{ skills[], diagnostics[] }` |
| `formatSkillsForPrompt(skills[])` | Formats skills into `<available_skills>` XML for system prompt injection per the Agent Skills standard, excluding any with `disableModelInvocation: true` |

Because Sero reads from the same global directory (`~/.pi/agent/skills/`), any skill installed for Pi CLI is automatically available in Sero.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DISK (Skill Sources)                          │
│                                                                        │
│  ~/.pi/agent/skills/              ← GLOBAL (shared with Pi CLI)        │
│    ├── pi-skills/                                                      │
│    │   ├── browser-tools/SKILL.md                                      │
│    │   ├── transcribe/SKILL.md                                         │
│    │   └── vscode/SKILL.md                                             │
│    ├── skills/skills/skills/                                           │
│    │   ├── frontend-design/SKILL.md                                    │
│    │   ├── webapp-testing/SKILL.md                                     │
│    │   └── skill-creator/SKILL.md                                      │
│    └── tavily-ai-skills/skills/tavily/                                 │
│        ├── search/SKILL.md                                             │
│        ├── crawl/SKILL.md                                              │
│        └── research/SKILL.md                                           │
│                                                                        │
│  <workspace>/.pi/skills/          ← PROJECT-LOCAL (per project)        │
│  <custom user paths>              ← CUSTOM (from settings)             │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                    ① DISCOVERY
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     SkillManager (Electron main process)                │
│                     electron/skill-manager.ts                          │
│                                                                        │
│  discoverAll()                                                         │
│    │                                                                   │
│    ├─→ loadSkillsFromDir({ dir: ~/.pi/agent/skills, source: 'global'})│
│    │      ↑ Pi SDK function — scans for SKILL.md, parses frontmatter  │
│    │                                                                   │
│    ├─→ loadSkillsFromDir({ dir: <custom paths>, source: 'custom' })   │
│    │                                                                   │
│    └─→ loadSkillsFromDir({ dir: .pi/skills, source: 'project' })      │
│                                                                        │
│  registry: Map<name, SeroSkill>   ← in-memory, all discovered skills  │
│    SeroSkill = Skill + { scope, enabled }                              │
│                                                                        │
│  projectConfigs: Map<projectId, SkillConfig>                           │
│    SkillConfig = { enabled: string[], disabled: string[] }             │
│    Persisted to: ~/Library/.../sero-data/projects/<id>/skills.json     │
│                                                                        │
│  Key methods:                                                          │
│    listAll(projectId) → SeroSkill[]  (with enabled state applied)     │
│    getEnabledSkills(projectId) → SeroSkill[]                          │
│    toggleSkill(projectId, name) → boolean                             │
│    formatForSystemPrompt(projectId) → string                          │
│      └─→ formatSkillsForPrompt(enabledSkills)                         │
│            ↑ Pi SDK function — renders XML per Agent Skills spec       │
│    readSkillContent(name) → string  (raw SKILL.md from disk)          │
│    installSkill(gitUrl | localPath) → clone/copy to global dir        │
│    createSkill(name, desc) → scaffold SKILL.md template               │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ② IPC BRIDGE   ③ PROMPT      ④ TOOL
          │          INJECTION     REGISTRATION
          │              │              │
          ▼              ▼              ▼
┌──────────────┐  ┌────────────────────────────────────────────────────┐
│  Renderer    │  │  AgentManager (Electron main process)              │
│  (React)     │  │  electron/agent-manager.ts                         │
│              │  │                                                    │
│  SkillsPanel │  │  createSession(projectId):                         │
│  ├ browse    │  │    │                                               │
│  ├ toggle    │  │    ├─→ buildSystemPrompt(projectId)                │
│  ├ search    │  │    │     │                                         │
│  ├ inspect   │  │    │     ├─ skillManager.formatForSystemPrompt()   │
│  ├ install   │  │    │     │    └─→ Pi SDK: formatSkillsForPrompt()  │
│  └ create    │  │    │     │         Returns XML like:               │
│              │  │    │     │         <available_skills>               │
│  skill-store │  │    │     │           <skill>                       │
│  (Zustand)   │  │    │     │             <name>search</name>         │
│              │  │    │     │             <description>...</desc...>   │
│              │  │    │     │             <location>/path/SKILL.md     │
│  preload.ts  │  │    │     │           </skill>                      │
│  window.sero │  │    │     │           ...                           │
│   .skills.*  │  │    │     │         </available_skills>             │
│              │  │    │     │                                         │
│              │  │    │     └─ Appended to system prompt as           │
│              │  │    │        "## Available Skills" section           │
│              │  │    │                                               │
│              │  │    └─→ registers read_skill tool                   │
│              │  │          execute(name) → skillManager               │
│              │  │            .readSkillContent(name)                  │
│              │  │          returns raw SKILL.md text to the LLM      │
│              │  │                                                    │
│              │  │  AT INFERENCE TIME (when user sends a prompt):     │
│              │  │                                                    │
│              │  │    LLM sees system prompt with skill descriptions  │
│              │  │      ↓                                             │
│              │  │    Task matches a skill's description?             │
│              │  │      ↓ yes                                         │
│              │  │    LLM calls read_skill({ name: "search" })        │
│              │  │      ↓                                             │
│              │  │    Tool reads SKILL.md from host filesystem        │
│              │  │      ↓                                             │
│              │  │    Full instructions returned to LLM context       │
│              │  │      ↓                                             │
│              │  │    LLM follows the skill's instructions            │
│              │  │    (may call bash, write, edit, etc. in container) │
└──────────────┘  └────────────────────────────────────────────────────┘
```

## Step by Step

### ① Discovery

On startup, `SkillManager.discoverAll()` scans three locations:

1. **`~/.pi/agent/skills/`** — Global skills, the same directory Pi CLI uses. Sero calls Pi SDK's `loadSkillsFromDir()` which walks the directory looking for `SKILL.md` files, parses their YAML frontmatter (`name`, `description`, `disable-model-invocation`), validates names against the Agent Skills spec, and returns `Skill` objects.
2. **`<workspace>/.pi/skills/`** — Project-local skills, discovered per-project via `discoverProjectSkills()`.
3. **Custom user-added paths** — Any additional directories the user has configured.

Each discovered skill is stored in `registry: Map<name, SeroSkill>` where `SeroSkill` extends Pi's `Skill` type with `scope` (global/project/custom) and `enabled` (boolean). First-discovered wins on name collisions, matching Pi's behavior.

### ② IPC Bridge

The renderer (React) talks to `SkillManager` via Electron IPC. The `SkillsPanel` component lets users browse, search, toggle, install (git clone or local copy), uninstall, and create skills. Toggle state is persisted per-project to `~/Library/Application Support/sero/sero-data/projects/<id>/skills.json` as `{ enabled: [], disabled: [] }`. Skills are enabled by default; the config only records explicit overrides.

**IPC channels:**

| Channel | Direction | Purpose |
|---|---|---|
| `skills:list` | renderer → main | List all skills with per-project enabled state |
| `skills:get` | renderer → main | Get a single skill by name |
| `skills:readContent` | renderer → main | Read the raw SKILL.md content |
| `skills:listFiles` | renderer → main | List files in a skill's directory |
| `skills:enable` | renderer → main | Enable a skill for a project |
| `skills:disable` | renderer → main | Disable a skill for a project |
| `skills:toggle` | renderer → main | Toggle, returns new enabled state |
| `skills:install` | renderer → main | Install from git URL or local path |
| `skills:uninstall` | renderer → main | Delete a skill from disk |
| `skills:create` | renderer → main | Scaffold a new skill from template |
| `skills:discover` | renderer → main | Re-scan all skill locations |

### ③ System Prompt Injection

When `AgentManager.createSession()` builds the system prompt, it calls `skillManager.formatForSystemPrompt(projectId)` which:

1. Filters to only enabled skills for that project via `getEnabledSkills(projectId)`
2. Passes them to Pi SDK's `formatSkillsForPrompt()` which renders them as `<available_skills>` XML per the [Agent Skills integration spec](https://agentskills.io/integrate-skills)
3. This XML block is appended to the system prompt under an `## Available Skills` heading

The LLM sees **only names and descriptions** — not the full instructions. This is the progressive disclosure pattern from Pi: keep the context window small, load details on demand.

### ④ The `read_skill` Tool

`AgentManager` registers a custom tool called `read_skill` that takes a skill name and returns the raw `SKILL.md` content by calling `skillManager.readSkillContent(name)`, which does `fs.readFileSync(skill.filePath, 'utf-8')` on the host filesystem.

When the LLM decides a task matches a skill description, it calls this tool, gets the full instructions, and follows them — which typically means calling `bash`, `write`, `edit`, etc. inside the container.

```
User: "Search the web for React 19 migration guides"
  ↓
LLM sees <skill><name>search</name><description>Search the web...</description></skill>
  ↓
LLM calls read_skill({ name: "search" })
  ↓
Tool returns full SKILL.md with setup steps, API usage, scripts
  ↓
LLM follows instructions, calls bash/write/etc. inside the container
```

## Host vs Container Boundary

Skills live on the **host**, not in the container. The `read_skill` tool reads from the host filesystem via `SkillManager`. The skill instructions then tell the LLM to execute commands **inside** the container via `bash`, `write`, etc.

This makes skills a host-side concern (knowledge and configuration) while execution remains sandboxed.

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│         HOST (macOS)        │     │    CONTAINER (Linux VM)     │
│                             │     │                             │
│  ~/.pi/agent/skills/        │     │  /workspace/                │
│    └── search/SKILL.md ─────┼──read_skill──→ LLM reads this   │
│                             │     │              ↓              │
│  SkillManager               │     │  LLM calls bash, write,    │
│  AgentManager               │     │  edit, etc. here            │
│  Electron main process      │     │                             │
└─────────────────────────────┘     └─────────────────────────────┘
```

## What Sero Adds Beyond Pi

| Concern | Pi CLI | Sero |
|---|---|---|
| Discovery | `loadSkillsFromDir()` | Same function, same global dir |
| Prompt format | `formatSkillsForPrompt()` | Same function |
| Skill loading | LLM calls `read` on the SKILL.md file path | LLM calls `read_skill` tool (wrapper around `readSkillContent()`) |
| Enable/disable | `--no-skills`, `disable-model-invocation` frontmatter | Per-project toggle UI, persisted to `skills.json` |
| Install | Manual `git clone` into `~/.pi/agent/skills/` | GUI + `installSkill()` does `git clone` or directory copy |
| Create | Ask Pi to scaffold one | GUI + `createSkill()` scaffolds `SKILL.md` template |
| Browse/inspect | Read files manually | `SkillsPanel` with search, detail view, file listing |

## Key Files

| File | Purpose |
|---|---|
| `electron/skill-manager.ts` | Discovery, registry, per-project config, install/uninstall/create |
| `electron/agent-manager.ts` | `buildSystemPrompt()` injects skills; `read_skill` tool registered here |
| `electron/ipc-handlers.ts` | IPC bridge for all `skills:*` channels |
| `electron/preload.ts` | Typed `window.sero.skills.*` API exposed to renderer |
| `src/stores/skill-store.ts` | Zustand store for UI state (skill list, selection, caches, search) |
| `src/components/panels/SkillsPanel.tsx` | Browse, toggle, inspect, install, create skills |

## Skill Format

Sero uses the same [Agent Skills standard](https://agentskills.io/specification) format as Pi:

```
my-skill/
├── SKILL.md              # Required: YAML frontmatter + instructions
├── scripts/              # Helper scripts
│   └── process.sh
├── references/           # Detailed docs loaded on-demand
│   └── api-reference.md
└── assets/
    └── template.json
```

**SKILL.md frontmatter:**

```yaml
---
name: my-skill
description: What this skill does and when to use it. Be specific.
disable-model-invocation: false   # optional, default false
---
```

**Name rules** (per Agent Skills spec):
- 1–64 characters
- Lowercase letters, numbers, hyphens only
- No leading/trailing hyphens, no consecutive hyphens
- Must match parent directory name

## Persistence

| Data | Path |
|---|---|
| Global skills | `~/.pi/agent/skills/` |
| Project-local skills | `<workspace>/.pi/skills/` |
| Per-project enable/disable config | `~/Library/Application Support/sero/sero-data/projects/<id>/skills.json` |
