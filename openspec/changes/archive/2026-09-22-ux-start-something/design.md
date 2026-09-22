## Context

See proposal.md for motivation and `specs/orchestrator-ui/spec.md` for the
requirements. This section records only the current state that shapes the
approach.

**The app root is 13px, so the theme's rem scale is not the drawing's px.** The
host sets `html { font-size: var(--font-size-base, 13px) }`. The plugin's theme
(`@sero-ai/ui/styles/plugin-theme.css`) overrides only the small end of
Tailwind's scale, all in `rem`, and the rest stays Tailwind's defaults in `rem`.
Measured in the running build:

```text
token        rem     px at 13px root
text-xs      0.8     10.4
text-sm      0.9     11.7
text-base    1.0     13
text-lg      1.125   14.625
text-xl      1.25    16.25
text-2xl     1.5     19.5
text-3xl     1.875   24.375   (not yet used, so not yet generated)

rounded-sm   4.125   rounded-md  6.125   rounded-lg  8.125   rounded-xl  12.125
p-2          6.5     p-3         9.75    h-9         29.25   (rem-based, scales)
```

The drawing is a standalone page with a 16px root. Copying its pixel values would
pin the UI and break under a theme change. The token ladder is the thing that
scales, and it lands close to the drawing's tiers.

**The planning cost already exists and is already counted.** `prepare` writes
`room.runtime.planningUsage` before the proposal is shown (`room-app-actions.ts`),
and a Workflow's `loop.planningUsage` accumulates across the Clarify and plan
calls (`runtime/planning-flow.ts`). Both already count toward enforced spend
(`openspec/specs/orchestrator-run-accounting/spec.md`). No record, store or
runtime change is needed; only surfaces that read them.

**`RoomProposal` is reached from two paths.** `RoomDraftReview` computes the
proposal from the stored blueprint and is opened both by the create flow and from
a Room's list. It already holds the Room record through `useRoom`, so the usage is
in hand; it is simply not passed to `RoomProposal`.

**No preview exists for these four surfaces.** The preview harness
(`ui/__preview__/previews.tsx`) covers Home, the Workflows list, a Workflow page,
a Room hold, Rooms, and the four read-the-outcome surfaces. Captures for this
change require new previews that render the real components.

## Goals / Non-Goals

**Goals:**

- Every appearance change in the four frames is expressed through the theme's
  existing scale, so a theme change carries through.
- A surface claims a spend figure only where a record holds one.
- The captures the drawing's rules require are reproducible from the repo.

**Non-Goals:**

- No new theme token, and no change to `@sero-ai/ui`, `plugin-theme.css` or the
  host `globals.css`.
- No change to the shared `room-kit` primitives' API beyond what a frame needs.
- No change to how planning usage is recorded, merged or enforced.

## Decisions

### Use the existing token ladder; invent no token

The drawing's pixel sizes map to existing utilities. Sizes are picked for the
closest rendered result at the 13px root, not for the drawing's literal number.

| drawing px | token | actual px |
|---|---|---|
| 24 | `text-3xl` | 24.4 |
| 19 | `text-2xl` | 19.5 |
| 16 | `text-xl` | 16.25 |
| 15 | `text-lg` | 14.6 |
| 12.5–13 | `text-base` | 13 |
| 11.5–12 | `text-sm` | 11.7 |
| 9–11 | `text-xs` | 10.4 |

Radii: 5–7 → `rounded-md` (6.1), 8–10 → `rounded-lg` (8.1), 12 → `rounded-xl`
(12.1). Spacing uses the Tailwind scale. Colours already resolve through the
`room-*` aliases onto host tokens and need no work.

Alternative rejected: adding a room type-scale token set (for example
`--text-room-label`) to `styles.css`. It would reproduce the drawing's odd
gradations, but it invents a second type vocabulary beside the one
`plugin-theme.css` already defines, and the four surfaces do not need it.

### Drop the fixed 9px mono tier on these surfaces

`room-mono-micro` is an existing utility, but it hardcodes `font-size: 9px`, so it
does not scale. On the four surfaces the micro label uses `font-mono text-xs`
(10.4px) instead. `room-mono-micro` itself is left alone: it is used well beyond
this change's scope, and changing it would move other surfaces. This divergence
is recorded, not silent.

### The planning cost is read from the record and passed down

`RoomDraftReview` reads `room.runtime.planningUsage` and passes it to
`RoomProposal`, which prints it beside Start room. The line appears on the plain
proposal and on the recomputed one, and is omitted when the usage is absent.
`CreateLoopWizard` already watches `loop.json`, so it prints the Workflow line
beside the save and activate buttons directly.

### The two cost strings differ

The Room string is the drawing's, word for word: `Designing this team cost $0.11`.
The Workflow Review step has no drawing, so its string was decided separately:
`Planning this cost $0.012`, from the loop's saved `planningUsage`.

### The spinner stays, against the "nothing animates" rule

#536 removed a pulse and a glow because meaning must not rest on motion. Frame 2
draws an animated spinner for work that is genuinely in flight, and the drawing
guards it with `prefers-reduced-motion`. The rule was about decoration; an
indeterminate progress mark is not decoration. The spinner is kept and the
reduced-motion guard is kept.

### The drawn glyph shapes win over the lucide defaults

The build uses `BadgeCheck` for the verified mark, `Download` on Install,
`ChevronRight`/`ChevronDown` for Details, and `Plus`/`RefreshCw` on the repo
controls. The drawing uses a `✓` glyph, plain text, and a CSS triangle. The
drawing governs, so the lucide icons are replaced on the frames where the drawing
does not draw them. Icons the drawing does not cover stay.

### The Workflow planning skeleton follows the same rule

`PlanMapSkeleton` pulses and draws four step-shaped placeholder boxes. It becomes
the same spinner and elapsed time as the Room wait, so the rule has one shape.
Its title has no drawing; `Planning this Workflow` is proposed.

### Captures come from previews that render the real components

A preview that re-draws a surface proves nothing about it. Four previews are added
(`room-brief`, `room-planning`, `room-proposal`, `catalog`) with fixtures derived
from the drawing's own records.

## Risks / Trade-offs

- **Pixel sizes are not reproducible.** `text-sm` renders 11.7 where the drawing
  says 11.5 or 12, and the spacing scale is 3.25px per step at this root, so some
  gaps land one step off. → Accepted. The ladder is what scales; the capture
  reports the deltas that remain.
- **`room-mono-micro` still does not scale elsewhere.** The four surfaces stop
  using it, but every other orchestrator surface keeps its fixed 9px. → Recorded
  as a known divergence. A later pass can move the whole plugin.
- **The Catalog mixes host primitives and token sizes.** It stays on `Card`,
  `Button`, `Input` and `Dialog` with token-sized classes rather than moving to
  `room-kit`. → Deliberate: no new abstraction, and the primitives already carry
  the theme through their own tokens.
- **The Workflow Review and the planning skeleton have no drawing.** Their
  appearance can only be inferred from frame 3 and the Room wait. → Their
  captures are compared with the nearest drawn frame, and `comparison.md` states
  that no drawing exists for them.
- **Entry order in a Catalog capture is fixture order.** The drawing groups by
  repo; the fixture may not. → Noted in `comparison.md` so it is not read as a
  defect.

## Open Questions

None. The two copy strings, the scope, and the token approach are settled.
