## Why

Screens that start work make claims the records contradict, and the Catalog
describes itself in words that say nothing. The Room brief and the Room wait
screen both say nothing has been spent, while designing the team is a model call
that already spent $0.11 on the Frogger Room. The wait screen invents progress
from a 3-second timer, a bar that fills to 94% and a countdown. The Room saves
its planning cost and no screen shows it. The Catalog's model-tier chip reads
`LOW` and `MED`, and its repo bar collapses into a centred column.

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/5-start-something.html`.
Its four frames, its Decisions and its "Controls on this screen today" lists are
binding. Side-by-side captures of the build against the drawing show drift on
all four frames: type sizes, chip shapes, drawn glyphs against lucide defaults,
and a name column that truncates member names.

## What Changes

- **The Room brief stops claiming nothing is spent.** The line under the brief
  becomes "The team starts only when you press Start room."
- **The Room wait screen stops inventing progress.** The five timed steps, the
  progress bar and the countdown are removed. A spinner and the real elapsed
  time since the request replace them.
- **The Workflow planning screen follows the same rule.** The pulsing skeleton
  with four step-shaped placeholders becomes one spinner and the real elapsed
  time.
- **The Room proposal is trimmed to the drawing.** The five approval subtitles
  and the "computed from the plan" hint are dropped. Read-only access reads
  `Read this workspace` rather than a value and a `read` sub-line. Member names
  are shown in full, in the drawing's column width.
- **The Room proposal shows what planning cost**, from the Room's saved
  `runtime.planningUsage`, beside Start room. The line is shown on the plain
  proposal and on the recomputed one, and is omitted when no usage was recorded.
- **A Workflow's Review step shows what planning cost**, from the loop's saved
  `planningUsage`, in the same place: `Planning this cost $0.012`.
- **The Catalog is corrected and aligned.** Repos, Add repo and Refresh sit on
  one row. The model-tier chip says what it is (`low-tier model`,
  `mid-tier model`, `high-tier model`). Every entry's Details stays folded and
  now lists the numbered step titles from the entry's `definition.plan.steps`.
  Type sizes, chips, controls and glyphs match the drawing.
- **All four frames match the drawing's appearance**: type sizes and weights,
  colours, backgrounds, borders, spacing, column widths and glyph shapes. The
  drawn shapes win over the lucide defaults the build currently uses.
- **Every size comes from the theme's existing scale.** Type, radius and spacing
  use the theme's token ladder rather than fixed pixel values, so a theme change
  carries through. No new token is introduced. The drawing is a standalone 16px
  page; the app root is 13px, so its literal pixels are mapped to the closest
  token in that ladder and the small differences are recorded.

Non-goals: the app top bar; Architect's New project screen; the never-captured
disconnected-workspace, reconnection and loading states; any change to how
planning usage is recorded or enforced.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator-ui`: adds requirements for the Room create flow (brief, wait,
  proposal), the Workflow create flow's wait and Review step, and the Catalog
  tab — including that the saved planning cost is shown and that these frames
  match the approved drawing.

## Impact

- `plugins/sero-orchestrator-plugin/ui/components/`: `RoomBriefForm.tsx`,
  `RoomPlanning.tsx`, `RoomDraftReview.tsx`, `RoomProposal.tsx`,
  `CreateLoopWizard.tsx`, `PlanMap.tsx` (skeleton), `CatalogBrowser.tsx`,
  `CatalogEntryCard.tsx`; `../lib/catalog-summary.ts`, `../lib/access-tile.ts`.
- `plugins/sero-orchestrator-plugin/ui/__preview__/`: new previews for the four
  surfaces, so the captures the drawing's rules require can be taken.
- No runtime, record, IPC or store change. `runtime.planningUsage` and
  `loop.planningUsage` already exist, are already written, and already count
  toward enforced spend (`orchestrator-run-accounting`).
- No change to `@sero-ai/ui`, `plugin-theme.css` or the host `globals.css`.
- `openspec/changes/ux-start-something/comparison.md` records the captures,
  including the frames that have no drawing to compare against.
