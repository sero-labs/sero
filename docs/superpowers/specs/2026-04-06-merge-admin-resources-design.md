# Merge Admin + Resources Plugins

**Date:** 2026-04-06  
**Status:** Draft

## Goal

Combine the Admin plugin (config editor, log viewer, session browser) and Resources plugin (agent/skill/prompt CRUD) into a single unified plugin with a scalable sectioned vertical nav layout.

## Why

1. **Conceptual overlap** — both manage Sero configuration/resources; Skills exists in both plugins (visibility toggles in Admin, CRUD editor in Resources).
2. **Sidebar bloat** — two entries in the main nav for one logical concern.
3. **Scalability** — neither layout scales well for future sections. Admin's horizontal tabs cap at ~8; Resources' sidebar tabs compete with list items.

## Design

### Layout: Sectioned Vertical Nav

Replace both plugins' layouts with a single nav sidebar + content area pattern (like macOS System Settings).

```
+-- Header ("Admin" . section label . profile badge) ---------------+
+----------+--------------------------------------------------------+
| NAV      | CONTENT AREA                                          |
| (160px)  |                                                       |
|          | CRUD sections (Agents, Skills, Prompts):               |
| RESOURCES|   +-- List (260px) --+-- Editor (flex-1) -----------+  |
|  Agents  |   | count   [+] [R]  | Form fields                 |  |
|  Skills  |   | [item 1]         | Name, Description, etc.      |  |
|  Prompts |   | [item 2]  ...    | Textarea for body/prompt     |  |
|          |   +------------------+------------------------------+  |
| CONFIG   |                                                        |
|  Settings| Non-CRUD sections (Settings, Logs, etc.):              |
|  Defaults|   +-- Sidebar (224px) +-- Detail (flex-1) ---------+  |
|  Plugins |   | CONFIG FILES       | JSON editor / viewer       |  |
|          |   | [Settings]         |                            |  |
| SYSTEM   |   | [Auth] sensitive   |                            |  |
|  Logs    |   +--------------------+----------------------------+  |
|  Sessions|                                                        |
+----------+--------------------------------------------------------+
```

### Navigation Sidebar

- **Width:** 160px, fixed, `border-r border-border/30`
- **Section headers:** uppercase, muted, `text-[10px] font-semibold text-muted-foreground/50`, with `px-3 pt-4 pb-1`
- **Nav items:** `px-3 py-1.5 text-xs`, with left-border accent on active (`border-l-2 border-primary`), subtle bg highlight
- **Three groups:**
  - **RESOURCES** — Agents, Skills, Prompts
  - **CONFIG** — Settings, Defaults, Plugins
  - **SYSTEM** — Logs, Sessions

### Sections

Each section renders its own content in the content area. Existing components are reused with minimal changes:

| Section | Source | Content Pattern | Components |
|---------|--------|-----------------|------------|
| Agents | Resources | List + Editor | AgentList, AgentEditor, useAgentCrud |
| Skills | Resources + Admin merged | List + Editor (with visibility toggle) | SkillList, SkillEditor, useSkillCrud + useSkillVisibility merged |
| Prompts | Resources | List + Editor | PromptList, PromptEditor, usePromptCrud |
| Settings | Admin (was "Config") | Sidebar + JSON Editor | ConfigPanel |
| Defaults | Admin | Full-width table | ModelDefaultsPanel |
| Plugins | Admin | Full-width card grid | PluginsPanel |
| Logs | Admin | Sidebar + Tail Viewer | LogViewer |
| Sessions | Admin | Sidebar + Message Viewer | SessionBrowser, SessionList, SessionDetail |

### Skills Merge

The Admin plugin's SkillsPanel (visibility toggles) and the Resources plugin's Skills tab (CRUD editor) become one unified section:

- The **SkillList** shows all skills (user, project, path) as before
- The **SkillEditor** gains a visibility toggle at the top of the form — a simple switch showing "Visible to model" / "Hidden from model"
- The standalone SkillsPanel from Admin is removed; its `useSkillVisibility` hook is integrated into `useSkillCrud` or composed alongside it

### State

Combined `AdminState` replaces both state files:

```typescript
type AdminSection = 
  | 'agents' | 'skills' | 'prompts'           // RESOURCES
  | 'settings' | 'modelDefaults' | 'plugins'  // CONFIG
  | 'logs' | 'sessions';                       // SYSTEM

interface AdminState {
  lastSection: AdminSection;
  lastConfigKey: string | null;
  lastSessionFile: string | null;
  lastAgent: string | null;
  lastSkill: string | null;
  lastPrompt: string | null;
}
```

State file remains `.sero/apps/admin/state.json`. The resources state file (`.sero/apps/resources/state.json`) becomes unused.

### Naming

The combined plugin keeps the name **"Admin"** and the id `admin`. The icon stays `settings`. The "Resources" entry disappears from the sidebar.

### Header

Updated to show section labels for all sections:

```
agents -> "Agents"
skills -> "Skills" 
prompts -> "Prompts"
settings -> "Configuration"
modelDefaults -> "Model Defaults"
plugins -> "Plugins"
logs -> "Logs"
sessions -> "Sessions"
```

### CSS / Animations

- Merge Resources' styles.css into Admin's styles.css (Resources has no custom styles beyond the shared Tailwind theme)
- Add nav item styles (hover, active state transitions)
- Content area fade-in animation (existing `admin-fade-in`) applies per section switch
- Add `@source` directives for new component paths

## File Changes

### Admin Plugin (modified)

| File | Action |
|------|--------|
| `shared/types.ts` | Add `AdminSection` type, resource-related types, update `AdminState` |
| `ui/AdminApp.tsx` | Replace tab bar with sectioned vertical nav shell |
| `ui/components/Header.tsx` | Update section label map |
| `ui/styles.css` | Add nav styles, merge resources source directives |
| `ui/components/NavSidebar.tsx` | **NEW** — vertical nav component |
| `ui/components/AgentList.tsx` | **MOVE** from resources (minimal changes) |
| `ui/components/AgentEditor.tsx` | **MOVE** from resources (minimal changes) |
| `ui/components/SkillList.tsx` | **MOVE** from resources (minimal changes) |
| `ui/components/SkillEditor.tsx` | **MOVE** from resources + add visibility toggle |
| `ui/components/PromptList.tsx` | **MOVE** from resources (minimal changes) |
| `ui/components/PromptEditor.tsx` | **MOVE** from resources (minimal changes) |
| `ui/hooks/useAgentCrud.ts` | **MOVE** from resources |
| `ui/hooks/useSkillCrud.ts` | **MOVE** from resources |
| `ui/hooks/usePromptCrud.ts` | **MOVE** from resources |
| `ui/components/SkillsPanel.tsx` | **DELETE** — replaced by merged Skills section |
| `ui/components/types.ts` | **NEW** — resource component types (from resources) |
| `ui/sero.d.ts` | **MOVE** IPC type declarations from resources (merge with existing) |
| `package.json` | Add tags from resources plugin |

### Resources Plugin (removed)

The entire `plugins/sero-resources-plugin/` directory is deleted after migration.

### Other

| File | Action |
|------|--------|
| `docs/plugins/technical.md` | Remove resources plugin from built-in table |
| `pnpm-workspace.yaml` | No change needed (glob pattern covers all `plugins/*`) |

## What's NOT Changing

- All existing IPC bridges — no main-process changes
- The admin plugin's extension (still a stub)
- Module Federation config (same remote name `sero_admin`, same port 5193)
- Any other plugin
- The host app's plugin discovery (auto-detects via `sero.app` in package.json)

## Aesthetic Notes

- CRUD sections (Agents, Skills, Prompts) use the Resources plugin's clean form aesthetic — metadata grid + large textarea
- Non-CRUD sections (Settings, Logs, Sessions) keep the Admin plugin's master/detail + JSON editor aesthetic
- Nav sidebar uses the same muted color palette as the admin header
- Active nav item: left border accent + subtle bg tint (like the resources list selection style)
- **Color variety:** Prefer the Resources plugin's more varied color approach (colored thinking badges, accent highlights per resource type) over Admin's uniform indigo/emerald palette. However, all accent colors must be derived from or harmonize with CSS theme variables (`--primary`, `--accent`, `--destructive`, etc.) so custom user themes remain coherent. Use semantic Tailwind classes and `hsl(var(...))` values rather than hardcoded hex/rgb where possible.
