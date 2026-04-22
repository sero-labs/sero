# Merge Admin + Resources Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine the Admin and Resources plugins into a single unified Admin plugin with a sectioned vertical nav layout.

**Architecture:** The Admin plugin absorbs all Resources plugin components (CRUD hooks, list/editor components, IPC types). The horizontal tab bar is replaced by a vertical nav sidebar with three section groups (Resources, Config, System). Each section renders its own content panel. The standalone SkillsPanel is removed; skill visibility toggles move into the SkillEditor.

**Tech Stack:** React 19, Tailwind 4, Module Federation, shadcn/ui, Zustand (via `useAppState`)

**Spec:** `docs/superpowers/specs/2026-04-06-merge-admin-resources-design.md`

---

## File Structure

### Files to create (in admin plugin)
| File | Responsibility |
|------|---------------|
| `ui/components/NavSidebar.tsx` | Vertical nav sidebar with section groups |
| `ui/components/ResourceSection.tsx` | Shared list+editor layout wrapper for CRUD sections |
| `ui/components/AgentList.tsx` | Agent list (from resources, unchanged) |
| `ui/components/AgentEditor.tsx` | Agent editor form (from resources, unchanged) |
| `ui/components/SkillList.tsx` | Skill list (from resources, unchanged) |
| `ui/components/SkillEditor.tsx` | Skill editor form (from resources, + visibility toggle) |
| `ui/components/PromptList.tsx` | Prompt list (from resources, unchanged) |
| `ui/components/PromptEditor.tsx` | Prompt editor form (from resources, unchanged) |
| `ui/components/types.ts` | Resource component types (from resources) |
| `ui/hooks/useAgentCrud.ts` | Agent CRUD hook (from resources, adjusted imports) |
| `ui/hooks/useSkillCrud.ts` | Skill CRUD hook (from resources, adjusted imports) |
| `ui/hooks/usePromptCrud.ts` | Prompt CRUD hook (from resources, adjusted imports) |

### Files to modify (in admin plugin)
| File | Changes |
|------|---------|
| `shared/types.ts` | Add `AdminSection` type, update `AdminState` with resource selection fields |
| `ui/AdminApp.tsx` | Replace tab bar with NavSidebar + section content routing |
| `ui/components/Header.tsx` | Update section label map for all 8 sections |
| `ui/hooks/useSeroFiles.ts` | Extend `SeroApi` with `subagent`, `prompts`, and CRUD `skills` bridges |
| `ui/styles.css` | Add nav sidebar styles, `@source` for new component dirs |
| `package.json` | Add resources-related tags |

### Files to delete
| File | Reason |
|------|--------|
| `ui/components/SkillsPanel.tsx` | Replaced by merged Skills section in SkillEditor |
| `ui/hooks/useSkillVisibility.ts` | Inlined into SkillEditor or composed in AdminApp |
| Entire `plugins/sero-resources-plugin/` | Absorbed into admin |

---

### Task 1: Update shared types

**Files:**
- Modify: `plugins/sero-admin-plugin/shared/types.ts`

- [ ] **Step 1: Update AdminTab → AdminSection and AdminState**

Replace the `AdminTab` type and `AdminState` interface with the expanded section-based versions:

```typescript
// In plugins/sero-admin-plugin/shared/types.ts

// Replace:
//   export type AdminTab = 'config' | 'modelDefaults' | 'skills' | 'plugins' | 'logs' | 'sessions';
// With:
export type AdminSection =
  | 'agents' | 'skills' | 'prompts'           // RESOURCES
  | 'settings' | 'modelDefaults' | 'plugins'  // CONFIG
  | 'logs' | 'sessions';                       // SYSTEM

// Replace the AdminState interface with:
export interface AdminState {
  lastSection: AdminSection;
  lastConfigKey: string | null;
  lastSessionFile: string | null;
  lastAgent: string | null;
  lastSkill: string | null;
  lastPrompt: string | null;
}

// Replace DEFAULT_STATE with:
export const DEFAULT_STATE: AdminState = {
  lastSection: 'agents',
  lastConfigKey: null,
  lastSessionFile: null,
  lastAgent: null,
  lastSkill: null,
  lastPrompt: null,
};
```

Remove the `AdminTab` export entirely — it's replaced by `AdminSection`.

- [ ] **Step 2: Verify typecheck fails (expected — AdminApp still references AdminTab)**

Run: `cd <repo-root> && pnpm --filter @sero-ai/plugin-admin typecheck 2>&1 | head -20`

Expected: Type errors referencing `AdminTab` in AdminApp.tsx and other files. This is expected — we'll fix them in later tasks.

- [ ] **Step 3: Commit**

```bash
git add plugins/sero-admin-plugin/shared/types.ts
git commit -m "$(cat <<'EOF'
refactor(admin): expand AdminTab → AdminSection with resource sections

Adds agents, skills, prompts, settings sections. Updates AdminState
to track last-selected resource items for state persistence.
EOF
)"
```

---

### Task 2: Extend SeroApi with resource IPC bridges

**Files:**
- Modify: `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts`

- [ ] **Step 1: Add resource-related types and IPC bridges to SeroApi**

Add the following types after the existing `AvailableSkillInfo` interface (around line 89):

```typescript
// ── Resource IPC types (from resources plugin) ────────────

export interface AgentSummaryIPC {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

export interface AgentFileDataIPC {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

export interface SkillSummaryIPC {
  name: string;
  description: string;
  filePath: string;
  source: 'user' | 'project' | 'path';
}

export interface SkillFileDataIPC {
  name: string;
  description: string;
  extraFrontmatter: Record<string, unknown>;
  filePath?: string;
  body: string;
}

export interface PromptTemplateSummaryIPC {
  name: string;
  description: string;
  filePath: string;
  relativePath: string;
}

export interface PromptTemplateFileDataIPC {
  name: string;
  description: string;
  filePath?: string;
  body: string;
}
```

Then extend the `SeroApi` interface — add these three new bridge properties:

```typescript
// Inside the SeroApi interface, add after the existing `skills` property:

  subagent: {
    listAgents(): Promise<AgentSummaryIPC[]>;
    readAgent(name: string): Promise<AgentFileDataIPC>;
    writeAgent(data: AgentFileDataIPC): Promise<void>;
    deleteAgent(name: string): Promise<void>;
  };
  // Extend existing skills block — add CRUD methods alongside existing visibility methods:
  // The existing skills property becomes:
  skills: {
    listAvailableSkills(): Promise<AvailableSkillInfo[]>;
    setDisabledModelSkills(skillNames: string[]): Promise<void>;
    listSkills(): Promise<SkillSummaryIPC[]>;
    readSkill(filePath: string): Promise<SkillFileDataIPC>;
    writeSkill(data: SkillFileDataIPC): Promise<string>;
    deleteSkill(filePath: string): Promise<void>;
  };
  prompts: {
    listPrompts(): Promise<PromptTemplateSummaryIPC[]>;
    readPrompt(filePath: string): Promise<PromptTemplateFileDataIPC>;
    writePrompt(data: PromptTemplateFileDataIPC): Promise<string>;
    deletePrompt(filePath: string): Promise<void>;
  };
```

Note: the `skills` property already exists — you need to merge the CRUD methods into the existing block, not add a duplicate.

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts
git commit -m "$(cat <<'EOF'
feat(admin): extend SeroApi with subagent, skills CRUD, and prompts IPC bridges

Adds type definitions for agent/skill/prompt CRUD operations
that the resource management UI needs.
EOF
)"
```

---

### Task 3: Copy resource component types

**Files:**
- Create: `plugins/sero-admin-plugin/ui/components/types.ts`

- [ ] **Step 1: Create the types file**

Copy `plugins/sero-resources-plugin/ui/components/types.ts` to `plugins/sero-admin-plugin/ui/components/types.ts`. The content is identical:

```typescript
// ── Agent types ──────────────────────────────────────────────

/** Agent summary (from listAgents IPC). */
export interface AgentSummary {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

/** Full agent file data (from readAgent IPC). */
export interface AgentFileData {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

// ── Skill types ──────────────────────────────────────────────

/** Skill source — matches the SDK's source identifiers. */
export type SkillSource = 'user' | 'project' | 'path';

/** Skill summary (from listSkills IPC — mirrors SDK Skill). */
export interface SkillSummary {
  name: string;
  description: string;
  filePath: string;
  source: SkillSource;
}

/** Full skill file data (from readSkill IPC). */
export interface SkillFileData {
  name: string;
  description: string;
  extraFrontmatter: Record<string, unknown>;
  /** Absolute path — set for existing skills, absent for new. */
  filePath?: string;
  body: string;
}

// ── Prompt template types ────────────────────────────────────

/** Summary of a discovered prompt template (for list view). */
export interface PromptTemplateSummary {
  name: string;
  description: string;
  filePath: string;
  relativePath: string;
}

/** Full prompt template data for editing. */
export interface PromptTemplateFileData {
  name: string;
  description: string;
  filePath?: string;
  body: string;
}

// ── Shared types ─────────────────────────────────────────────

/** Which resource tab is active. */
export type ResourceTab = 'agents' | 'skills' | 'prompts';
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/types.ts
git commit -m "feat(admin): add resource component types for agent/skill/prompt CRUD"
```

---

### Task 4: Copy CRUD hooks

**Files:**
- Create: `plugins/sero-admin-plugin/ui/hooks/useAgentCrud.ts`
- Create: `plugins/sero-admin-plugin/ui/hooks/useSkillCrud.ts`
- Create: `plugins/sero-admin-plugin/ui/hooks/usePromptCrud.ts`

- [ ] **Step 1: Copy useAgentCrud.ts**

Copy `plugins/sero-resources-plugin/ui/hooks/useAgentCrud.ts` to `plugins/sero-admin-plugin/ui/hooks/useAgentCrud.ts`. The file is identical — the import path `../components/types` resolves correctly in both locations.

- [ ] **Step 2: Copy useSkillCrud.ts**

Copy `plugins/sero-resources-plugin/ui/hooks/useSkillCrud.ts` to `plugins/sero-admin-plugin/ui/hooks/useSkillCrud.ts`. Identical — same relative import paths.

- [ ] **Step 3: Copy usePromptCrud.ts**

Copy `plugins/sero-resources-plugin/ui/hooks/usePromptCrud.ts` to `plugins/sero-admin-plugin/ui/hooks/usePromptCrud.ts`. Identical — same relative import paths.

- [ ] **Step 4: Commit**

```bash
git add plugins/sero-admin-plugin/ui/hooks/useAgentCrud.ts plugins/sero-admin-plugin/ui/hooks/useSkillCrud.ts plugins/sero-admin-plugin/ui/hooks/usePromptCrud.ts
git commit -m "feat(admin): add agent/skill/prompt CRUD hooks from resources plugin"
```

---

### Task 5: Copy list and editor components

**Files:**
- Create: `plugins/sero-admin-plugin/ui/components/AgentList.tsx`
- Create: `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx`
- Create: `plugins/sero-admin-plugin/ui/components/SkillList.tsx`
- Create: `plugins/sero-admin-plugin/ui/components/PromptList.tsx`
- Create: `plugins/sero-admin-plugin/ui/components/PromptEditor.tsx`

- [ ] **Step 1: Copy AgentList.tsx**

Copy `plugins/sero-resources-plugin/ui/components/AgentList.tsx` to `plugins/sero-admin-plugin/ui/components/AgentList.tsx`. Identical file — imports from `./types` and `@sero-ai/ui/*` which both resolve.

- [ ] **Step 2: Copy AgentEditor.tsx**

Copy `plugins/sero-resources-plugin/ui/components/AgentEditor.tsx` to `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx`. Identical file.

- [ ] **Step 3: Copy SkillList.tsx**

Copy `plugins/sero-resources-plugin/ui/components/SkillList.tsx` to `plugins/sero-admin-plugin/ui/components/SkillList.tsx`. Identical file.

- [ ] **Step 4: Copy PromptList.tsx**

Copy `plugins/sero-resources-plugin/ui/components/PromptList.tsx` to `plugins/sero-admin-plugin/ui/components/PromptList.tsx`. Identical file.

- [ ] **Step 5: Copy PromptEditor.tsx**

Copy `plugins/sero-resources-plugin/ui/components/PromptEditor.tsx` to `plugins/sero-admin-plugin/ui/components/PromptEditor.tsx`. Identical file.

- [ ] **Step 6: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/AgentList.tsx plugins/sero-admin-plugin/ui/components/AgentEditor.tsx plugins/sero-admin-plugin/ui/components/SkillList.tsx plugins/sero-admin-plugin/ui/components/PromptList.tsx plugins/sero-admin-plugin/ui/components/PromptEditor.tsx
git commit -m "feat(admin): add agent/skill/prompt list and editor components from resources plugin"
```

---

### Task 6: Create SkillEditor with visibility toggle

**Files:**
- Create: `plugins/sero-admin-plugin/ui/components/SkillEditor.tsx`

This is the one component that differs from the resources version — it gains a visibility toggle.

- [ ] **Step 1: Create SkillEditor with integrated visibility toggle**

```typescript
/**
 * SkillEditor — form for editing skill metadata + SKILL.md body.
 * Includes a visibility toggle (merged from Admin's SkillsPanel).
 */

import { useCallback } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SkillFileData, SkillSource } from './types';

interface SkillEditorProps {
  data: SkillFileData;
  isNew: boolean;
  saving: boolean;
  /** Source of the skill — only 'user' skills can be deleted. */
  source: SkillSource | null;
  /** Whether this skill is visible to the model (not disabled). */
  visibleToModel?: boolean;
  /** Whether this skill's visibility is locked (disableModelInvocation). */
  lockedHidden?: boolean;
  /** Called when user toggles visibility. */
  onVisibilityChange?: (visible: boolean) => void;
  onSave: (data: SkillFileData) => void;
  /** Called with the skill's filePath for existing skills. */
  onDelete: (filePath: string) => void;
  onChange: (data: SkillFileData) => void;
}

/** Must match VALID_SKILL_NAME in electron/ipc/skills.ts */
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function SkillEditor({
  data, isNew, saving, source,
  visibleToModel, lockedHidden, onVisibilityChange,
  onSave, onDelete, onChange,
}: SkillEditorProps) {
  const update = useCallback(
    (partial: Partial<SkillFileData>) => onChange({ ...data, ...partial }),
    [data, onChange],
  );

  const canSave = data.name.length > 0 && NAME_RE.test(data.name) && data.body.length > 0;
  const canDelete = !isNew && data.filePath && source === 'user';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(data);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0">
      {/* ── Header bar ─────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {isNew ? 'New Skill' : data.name}
        </span>
        {source && source !== 'user' && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {source}
          </span>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(data.filePath!)}
          >
            🗑 Delete
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSave || saving}>
          {saving ? 'Saving…' : '💾 Save'}
        </Button>
      </div>

      {/* ── Metadata fields ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3">
        <Field label="Name" hint="lowercase, hyphens only">
          <input
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={!isNew}
            placeholder="my-skill"
            className={cn(fieldClass, !isNew && 'opacity-60')}
          />
        </Field>

        <Field label="Description">
          <input
            type="text"
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this skill does"
            className={fieldClass}
          />
        </Field>
      </div>

      {/* ── Visibility toggle (only for existing, non-new skills) ── */}
      {!isNew && onVisibilityChange !== undefined && visibleToModel !== undefined && (
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-foreground/85">Model Visibility</p>
            <p className="text-[10px] text-muted-foreground/60">
              {lockedHidden
                ? 'This skill requires explicit invocation'
                : visibleToModel
                  ? 'Model can invoke this skill automatically'
                  : 'Hidden — use /skill:name to invoke'}
            </p>
          </div>
          <Switch
            checked={visibleToModel}
            disabled={lockedHidden}
            onCheckedChange={onVisibilityChange}
            aria-label={`Toggle model visibility for ${data.name}`}
            className="data-[state=checked]:bg-[var(--status-success)]"
          />
        </div>
      )}

      {/* ── Skill body (SKILL.md content after frontmatter) ── */}
      <div className="flex flex-1 flex-col min-h-0 px-4 py-3">
        <label className="mb-1.5 text-xs font-medium text-muted-foreground">
          Skill Body
        </label>
        <textarea
          value={data.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="# My Skill&#10;&#10;Instructions for the agent when this skill is active..."
          className={cn(
            'flex-1 min-h-0 resize-none rounded-md border border-input bg-background',
            'px-3 py-2 text-sm text-foreground font-mono leading-relaxed',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
      </div>
    </form>
  );
}

// ── Helpers ──────────────────────────────────────────────────

const fieldClass = cn(
  'w-full rounded-md border border-input bg-background',
  'px-2.5 py-1.5 text-sm text-foreground',
  'placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
);

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-1 font-normal text-muted-foreground/50">({hint})</span>
        )}
      </label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/SkillEditor.tsx
git commit -m "feat(admin): add SkillEditor with integrated visibility toggle"
```

---

### Task 7: Create ResourceSection wrapper component

**Files:**
- Create: `plugins/sero-admin-plugin/ui/components/ResourceSection.tsx`

This component encapsulates the shared list+editor layout pattern used by Agents, Skills, and Prompts sections.

- [ ] **Step 1: Create ResourceSection**

```typescript
/**
 * ResourceSection — shared list + editor layout for CRUD resource sections.
 * Used by Agents, Skills, and Prompts sections.
 */

import { useCallback } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';

interface ResourceSectionProps {
  /** Resource label (e.g. "Agent", "Skill", "Prompt"). */
  label: string;
  /** Total count of items. */
  count: number;
  /** Loading state for the list. */
  loading: boolean;
  /** Saving state for the editor. */
  saving: boolean;
  /** Error message. */
  error: string | null;
  /** Refresh handler. */
  onRefresh: () => void;
  /** Create-new handler. */
  onNew: () => void;
  /** The list component (left panel). */
  list: React.ReactNode;
  /** The editor component (right panel), or null for empty state. */
  editor: React.ReactNode | null;
}

export function ResourceSection({
  label,
  count,
  loading,
  saving,
  error,
  onRefresh,
  onNew,
  list,
  editor,
}: ResourceSectionProps) {
  return (
    <div className="flex min-h-0 flex-1">
      {/* ── List panel ──────────────────────────────── */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-border/30">
        {/* Actions row */}
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5">
          <span className="flex-1 text-xs text-muted-foreground">
            {count} {label.toLowerCase()}{count !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            title="Refresh"
          >
            <span className="text-xs">↻</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNew}
            title={`New ${label}`}
          >
            <span className="text-xs">+</span>
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="admin-loading text-xs text-muted-foreground">Loading…</span>
          </div>
        ) : (
          list
        )}
      </div>

      {/* ── Editor panel ────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {editor ?? <EmptyState label={label} onNew={onNew} />}
      </div>
    </div>
  );
}

function EmptyState({ label, onNew }: { label: string; onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary/60"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground">
        Select a {label.toLowerCase()} to edit, or create a new one
      </p>
      <Button variant="secondary" size="sm" onClick={onNew}>
        + New {label}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/ResourceSection.tsx
git commit -m "feat(admin): add ResourceSection layout wrapper for CRUD sections"
```

---

### Task 8: Create NavSidebar component

**Files:**
- Create: `plugins/sero-admin-plugin/ui/components/NavSidebar.tsx`

- [ ] **Step 1: Create the vertical nav sidebar**

```typescript
/**
 * NavSidebar — vertical nav with grouped sections for the Admin app.
 *
 * Three groups: RESOURCES (Agents, Skills, Prompts),
 * CONFIG (Settings, Defaults, Plugins), SYSTEM (Logs, Sessions).
 */

import { memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { AdminSection } from '../../shared/types';

interface NavSidebarProps {
  active: AdminSection;
  onSelect: (section: AdminSection) => void;
}

interface NavItem {
  id: AdminSection;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Resources',
    items: [
      { id: 'agents', label: 'Agents' },
      { id: 'skills', label: 'Skills' },
      { id: 'prompts', label: 'Prompts' },
    ],
  },
  {
    title: 'Config',
    items: [
      { id: 'settings', label: 'Settings' },
      { id: 'modelDefaults', label: 'Defaults' },
      { id: 'plugins', label: 'Plugins' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'logs', label: 'Logs' },
      { id: 'sessions', label: 'Sessions' },
    ],
  },
];

export const NavSidebar = memo(function NavSidebar({ active, onSelect }: NavSidebarProps) {
  return (
    <nav className="flex w-[160px] shrink-0 flex-col border-r border-border/30 bg-background">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            {group.title}
          </p>
          {group.items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'admin-nav-item flex w-full items-center px-3 py-1.5 text-xs transition-colors duration-150',
                'hover:bg-secondary/50 hover:text-foreground',
                active === item.id
                  ? 'border-l-2 border-l-primary bg-primary/8 text-foreground font-medium'
                  : 'border-l-2 border-l-transparent text-muted-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/NavSidebar.tsx
git commit -m "feat(admin): add NavSidebar with grouped section navigation"
```

---

### Task 9: Update Header component

**Files:**
- Modify: `plugins/sero-admin-plugin/ui/components/Header.tsx`

- [ ] **Step 1: Update the section label map**

In `Header.tsx`, replace the `activeTab` prop name and label map. Change the `HeaderProps` interface and the `tabLabel` logic:

Replace the entire `Header.tsx` content:

```typescript
/**
 * Header — title bar with profile indicator.
 * Wrapped in React.memo — props are stable.
 */

import { memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import type { AdminSection } from '../../shared/types';

interface HeaderProps {
  profileName: string | null;
  activeSection: AdminSection;
}

const SECTION_LABELS: Record<AdminSection, string> = {
  agents: 'Agents',
  skills: 'Skills',
  prompts: 'Prompts',
  settings: 'Configuration',
  modelDefaults: 'Model Defaults',
  plugins: 'Plugins',
  logs: 'Logs',
  sessions: 'Sessions',
};

export const Header = memo(function Header({ profileName, activeSection }: HeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">Admin</h1>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="text-xs text-muted-foreground/70">{SECTION_LABELS[activeSection]}</span>
        </div>
      </div>
      {profileName && (
        <Badge
          variant="outline"
          className={cn(
            'h-5 rounded-md border-primary/20 px-2 text-[10px] font-medium',
            'bg-primary/5 text-primary',
          )}
        >
          {profileName}
        </Badge>
      )}
    </div>
  );
});
```

Note: The icon colors changed from hardcoded `indigo-400`/`indigo-500` to theme-aware `primary` — this follows the spec requirement that colors derive from CSS theme variables.

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/Header.tsx
git commit -m "refactor(admin): update Header to use AdminSection labels and theme-aware colors"
```

---

### Task 10: Update styles.css

**Files:**
- Modify: `plugins/sero-admin-plugin/ui/styles.css`

- [ ] **Step 1: Add source directives and nav styles**

Add the `@source` directive for the new components directory and nav item styles. Update `styles.css`:

After the existing `@source` lines at the top, ensure these are present:

```css
@source "./components";
@source "./hooks";
```

Add at the end of the file (after the `.admin-loading` block):

```css
/* ── Nav sidebar items ─────────────────────────────────── */

.admin-nav-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 32px;
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/styles.css
git commit -m "style(admin): add nav sidebar styles and source directives"
```

---

### Task 11: Rewrite AdminApp with vertical nav layout

**Files:**
- Modify: `plugins/sero-admin-plugin/ui/AdminApp.tsx`

This is the core task — replacing the tab bar with the vertical nav + section content routing.

- [ ] **Step 1: Rewrite AdminApp.tsx**

Replace the entire `AdminApp.tsx` with:

```typescript
/**
 * AdminApp — unified Sero Admin + Resources app.
 *
 * Sectioned vertical nav layout:
 *  - RESOURCES: Agents, Skills, Prompts (CRUD with list + editor)
 *  - CONFIG: Settings, Defaults, Plugins
 *  - SYSTEM: Logs, Sessions
 *
 * Uses CSS fade transitions for smooth section switching.
 * Profile-aware — shows active profile and reads from the correct path.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { AdminState, AdminSection } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { useProfiles } from './hooks/useSeroFiles';
import { useAgentCrud } from './hooks/useAgentCrud';
import { useSkillCrud } from './hooks/useSkillCrud';
import { usePromptCrud } from './hooks/usePromptCrud';
import { useSkillVisibility } from './hooks/useSkillVisibility';
import { Header } from './components/Header';
import { NavSidebar } from './components/NavSidebar';
import { ResourceSection } from './components/ResourceSection';
import { AgentList } from './components/AgentList';
import { AgentEditor } from './components/AgentEditor';
import { SkillList } from './components/SkillList';
import { SkillEditor } from './components/SkillEditor';
import { PromptList } from './components/PromptList';
import { PromptEditor } from './components/PromptEditor';
import { ConfigPanel } from './components/ConfigPanel';
import { ModelDefaultsPanel } from './components/ModelDefaultsPanel';
import { PluginsPanel } from './components/PluginsPanel';
import { LogViewer } from './components/LogViewer';
import { SessionBrowser } from './components/SessionBrowser';
import './styles.css';

export function AdminApp() {
  const [state, updateState] = useAppState<AdminState>(DEFAULT_STATE);
  const { activeProfile, loading: profilesLoading } = useProfiles();

  const [activeSection, setActiveSection] = useState<AdminSection>(state.lastSection ?? 'agents');
  const [selectedConfigKey, setSelectedConfigKey] = useState<string | null>(state.lastConfigKey);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(state.lastSessionFile);

  // ── Resource CRUD state ───────────────────────────────────
  const [resourceLoading, setResourceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setErrorMsg = useCallback((msg: string) => setError(msg), []);

  const agentCrud = useAgentCrud(setErrorMsg, setSaving);
  const skillCrud = useSkillCrud(setErrorMsg, setSaving);
  const promptCrud = usePromptCrud(setErrorMsg, setSaving);

  const profilePath = activeProfile?.path ?? null;
  const profileName = activeProfile?.name ?? null;

  // Skill visibility (for the toggle in SkillEditor)
  const skillVisibility = useSkillVisibility(profilePath);

  // Initial load for resources
  useEffect(() => {
    setResourceLoading(true);
    setError(null);
    Promise.all([agentCrud.refresh(), skillCrud.refresh(), promptCrud.refresh()]).finally(() =>
      setResourceLoading(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistence callbacks ─────────────────────────────────

  const handleSectionChange = useCallback((section: AdminSection) => {
    setActiveSection(section);
    setError(null);
    updateState((prev) => ({ ...prev, lastSection: section }));
  }, [updateState]);

  const handleSelectConfig = useCallback((key: string) => {
    setSelectedConfigKey(key);
    updateState((prev) => ({ ...prev, lastConfigKey: key }));
  }, [updateState]);

  const handleSelectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    updateState((prev) => ({ ...prev, lastSessionFile: id }));
  }, [updateState]);

  // ── Skill visibility lookup for the editor ────────────────

  const getSkillVisibility = useCallback((skillName: string) => {
    const row = skillVisibility.skills.find((s) => s.name === skillName);
    return {
      visibleToModel: row?.visibleToModel ?? true,
      lockedHidden: row?.lockedHidden ?? false,
    };
  }, [skillVisibility.skills]);

  const handleSkillVisibilityChange = useCallback((skillName: string, visible: boolean) => {
    skillVisibility.setSkillEnabled(skillName, visible);
  }, [skillVisibility]);

  // ── Loading state ─────────────────────────────────────────

  if (profilesLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="admin-loading text-xs text-muted-foreground">Loading profiles…</div>
      </div>
    );
  }

  // ── Section content renderer ──────────────────────────────

  const renderSection = () => {
    switch (activeSection) {
      case 'agents':
        return (
          <ResourceSection
            label="Agent"
            count={agentCrud.agents.length}
            loading={resourceLoading}
            saving={saving}
            error={error}
            onRefresh={agentCrud.refresh}
            onNew={agentCrud.startNew}
            list={
              <AgentList
                agents={agentCrud.agents}
                selected={agentCrud.selected}
                onSelect={agentCrud.select}
              />
            }
            editor={agentCrud.editing ? (
              <AgentEditor
                data={agentCrud.editing}
                isNew={agentCrud.isNew}
                saving={saving}
                onSave={agentCrud.save}
                onDelete={agentCrud.remove}
                onChange={agentCrud.setEditing}
              />
            ) : null}
          />
        );

      case 'skills': {
        const vis = skillCrud.editing && !skillCrud.isNew
          ? getSkillVisibility(skillCrud.editing.name)
          : null;
        return (
          <ResourceSection
            label="Skill"
            count={skillCrud.skills.length}
            loading={resourceLoading}
            saving={saving}
            error={error}
            onRefresh={skillCrud.refresh}
            onNew={skillCrud.startNew}
            list={
              <SkillList
                skills={skillCrud.skills}
                selected={skillCrud.selected}
                onSelect={skillCrud.select}
              />
            }
            editor={skillCrud.editing ? (
              <SkillEditor
                data={skillCrud.editing}
                isNew={skillCrud.isNew}
                saving={saving}
                source={skillCrud.selectedSource}
                visibleToModel={vis?.visibleToModel}
                lockedHidden={vis?.lockedHidden}
                onVisibilityChange={
                  vis ? (visible) => handleSkillVisibilityChange(skillCrud.editing!.name, visible) : undefined
                }
                onSave={skillCrud.save}
                onDelete={skillCrud.remove}
                onChange={skillCrud.setEditing}
              />
            ) : null}
          />
        );
      }

      case 'prompts':
        return (
          <ResourceSection
            label="Prompt"
            count={promptCrud.prompts.length}
            loading={resourceLoading}
            saving={saving}
            error={error}
            onRefresh={promptCrud.refresh}
            onNew={promptCrud.startNew}
            list={
              <PromptList
                prompts={promptCrud.prompts}
                selected={promptCrud.selected}
                onSelect={promptCrud.select}
              />
            }
            editor={promptCrud.editing ? (
              <PromptEditor
                data={promptCrud.editing}
                isNew={promptCrud.isNew}
                saving={saving}
                onSave={promptCrud.save}
                onDelete={promptCrud.remove}
                onChange={promptCrud.setEditing}
              />
            ) : null}
          />
        );

      case 'settings':
        return (
          <ConfigPanel
            profilePath={profilePath}
            selectedKey={selectedConfigKey}
            onSelectKey={handleSelectConfig}
          />
        );

      case 'modelDefaults':
        return <ModelDefaultsPanel />;

      case 'plugins':
        return <PluginsPanel />;

      case 'logs':
        return <LogViewer />;

      case 'sessions':
        return (
          <SessionBrowser
            selectedSessionId={selectedSessionId}
            onSelectSession={handleSelectSession}
          />
        );
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header profileName={profileName} activeSection={activeSection} />
      <div className="flex min-h-0 flex-1">
        <NavSidebar active={activeSection} onSelect={handleSectionChange} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div key={activeSection} className="admin-fade-in flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminApp;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd <repo-root> && pnpm --filter @sero-ai/plugin-admin typecheck`

Expected: 0 errors. If there are errors, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add plugins/sero-admin-plugin/ui/AdminApp.tsx
git commit -m "$(cat <<'EOF'
feat(admin): replace tab bar with vertical nav + section routing

Integrates agent/skill/prompt CRUD from resources plugin.
Skills section now includes visibility toggle from old SkillsPanel.
Layout uses NavSidebar with three groups: Resources, Config, System.
EOF
)"
```

---

### Task 12: Delete the old SkillsPanel

**Files:**
- Delete: `plugins/sero-admin-plugin/ui/components/SkillsPanel.tsx`
- Delete: `plugins/sero-admin-plugin/ui/hooks/useSkillVisibility.ts` — **DO NOT DELETE** (still used by AdminApp for skill visibility)

Wait — `useSkillVisibility.ts` is still used by AdminApp for the visibility toggle in SkillEditor. Only delete `SkillsPanel.tsx`.

- [ ] **Step 1: Delete SkillsPanel.tsx**

```bash
rm plugins/sero-admin-plugin/ui/components/SkillsPanel.tsx
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `cd <repo-root> && pnpm --filter @sero-ai/plugin-admin typecheck`

Expected: 0 errors (SkillsPanel is no longer imported by AdminApp).

- [ ] **Step 3: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/SkillsPanel.tsx
git commit -m "refactor(admin): remove standalone SkillsPanel — merged into SkillEditor"
```

---

### Task 13: Update package.json tags

**Files:**
- Modify: `plugins/sero-admin-plugin/package.json`

- [ ] **Step 1: Add resource-related tags**

In the `sero.plugin.tags` array, add the resources-related tags:

```json
"tags": [
  "admin",
  "settings",
  "sessions",
  "logs",
  "agents",
  "skills",
  "prompts"
]
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/package.json
git commit -m "chore(admin): add agents/skills/prompts tags to plugin metadata"
```

---

### Task 14: Delete the resources plugin

**Files:**
- Delete: `plugins/sero-resources-plugin/` (entire directory)

- [ ] **Step 1: Remove the resources plugin directory**

```bash
rm -rf plugins/sero-resources-plugin
```

- [ ] **Step 2: Update pnpm lockfile**

```bash
cd <repo-root> && pnpm install
```

This regenerates the lockfile without the resources plugin.

- [ ] **Step 3: Verify full monorepo typecheck**

Run: `cd <repo-root> && pnpm typecheck`

Expected: All packages pass with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: remove sero-resources-plugin — absorbed into admin plugin

All agent/skill/prompt CRUD functionality now lives in the admin
plugin with a unified vertical nav layout.
EOF
)"
```

---

### Task 15: Update documentation

**Files:**
- Modify: `docs/plugins/technical.md`

- [ ] **Step 1: Remove resources plugin from the built-in plugin table**

In `docs/plugins/technical.md`, find the table row containing `sero-resources-plugin` and remove it. Update the admin plugin's description to mention resource management:

Find the row:
```
| `sero-resources-plugin` | developer-tools |
```
Remove that row.

Update the admin row description (if it exists) to mention it now includes agent/skill/prompt management.

- [ ] **Step 2: Commit**

```bash
git add docs/plugins/technical.md
git commit -m "docs: update plugin table — resources merged into admin"
```

---

### Task 16: Build and smoke test

- [ ] **Step 1: Build the admin plugin**

```bash
cd <repo-root> && pnpm --filter @sero-ai/plugin-admin build
```

Expected: Build completes without errors.

- [ ] **Step 2: Build the full monorepo**

```bash
cd <repo-root> && pnpm build
```

Expected: All packages build without errors.

- [ ] **Step 3: Run the dev server and test manually**

```bash
cd <repo-root>/apps/desktop && bash scripts/dev.sh
```

Manual checks:
1. Only "Admin" appears in the sidebar (no "Resources" entry)
2. NavSidebar shows three groups: Resources, Config, System
3. Clicking "Agents" shows the agent list + editor
4. Clicking "Skills" shows the skill list + editor with visibility toggle
5. Clicking "Prompts" shows the prompt list + editor
6. Clicking "Settings" shows the config file list + JSON editor
7. Clicking "Defaults" shows the model defaults table
8. Clicking "Plugins" shows the plugin cards
9. Clicking "Logs" shows the log viewer
10. Clicking "Sessions" shows the session browser
11. Section switching preserves fade-in animation
12. Section selection is remembered after switching back and forth

- [ ] **Step 4: Commit final state (if any fixes were needed)**

Only if fixes were required during smoke testing.
