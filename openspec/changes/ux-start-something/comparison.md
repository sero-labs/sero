# Matching the drawing

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/5-start-something.html`.
Its four frames, its Decisions and its "Controls on this screen today" lists are
binding.

## How the captures were taken

- Drawing: the four `section.state .app` frames screenshotted individually at a
  1520 viewport, from `file://`.
- Build: previews added by this change render the real components at a 1440
  panel. Captured at a 1600 viewport so the panel is not clipped by the page's own
  padding, with every fold opened on both sides first.
- Playwright (the same module build the preview harness resolves), not
  agent-browser.
- New previews: `room-brief`, `room-planning`, `plan-map-skeleton`,
  `room-proposal`, `catalog`, in `ui/__preview__/start-something-fixture.tsx`.
  Each renders the REAL component; a preview that re-draws a surface proves
  nothing about the surface.

## The measurement this change rests on

The prototype is a standalone page at a 16px root. The app root is 13px
(`html { font-size: var(--font-size-base, 13px) }`), so the theme's rem scale
renders smaller:

```text
text-xs 10.4   text-sm 11.7   text-base 13   text-lg 14.6   text-2xl 19.5   text-3xl 24.4
```

This is why sizes are mapped to the theme's ladder rather than copied as pixels.
The rule used here: reproduce the drawing's pixel value at the default root,
expressed through the theme's rem-based utilities, so a theme change carries
through. Column widths follow the same rule (drawing px ÷ 13, in `rem`).

## Defects the captures found, and what was done

| Frame | What the capture showed | Outcome |
| --- | --- | --- |
| 3 | Member names truncate: `Nova — Product Con…`, `Flux — Canvas Engineering A…`. The name column was `w-[190px]` with `truncate`. | Fixed. The column is the drawing's 230px in rem and no longer truncates. |
| 4 | The repository bar rendered as a centred vertical stack. The shared `Card` sets `flex-col`, which the caller's `flex` did not override. | Fixed. `flex-row` on the caller. |
| 4 | The model-tier chip read `LOW` / `MED`, its raw code. | Fixed. `low-tier model` / `mid-tier model` / `high-tier model`, with a unit test for all three tiers and the no-tier case. |
| 4 | No entry listed the steps it runs, and `hasDetail` ignored `definition.plan.steps`. | Fixed. Details lists the numbered step titles and appears for a step-only entry. |
| 1 | The headline was `text-[27px]` where the drawing is 24; the textarea `min-h-[132px]` where the drawing is 92; the chips `h-[34px]` against 30; the buttons `h-[38px]` against 30. | Fixed to the token ladder. |
| 3 | The approval band carried the `computed from the plan…` hint and four subtitles the drawing does not have. | Removed. |
| 3 | Read-only access read as a value with a separate `read` line. | Fixed. `accessSentence()` composes `Read this workspace`; the advanced-settings tile is unchanged. |
| 4 | `BadgeCheck` stood in for the drawn `✓`; `Download` stood in for a text-only Install; a chevron stood in for the drawn triangle; chips had no drawn border. | Replaced with the drawn shapes. |

One capture claim from planning is **withdrawn**: the Catalog entry title and
chips were reported as "16px / 14px against 13 / 11.5". That comparison ignored
the 16px-vs-13px root difference. The title was `text-base` (13px) and the chips
`text-sm` (11.7px), already close to the drawing. The real Catalog gaps were
shape and radius, not type size.

## Captures read beside the drawing

| Frame | Compared |
| --- | --- |
| 1 · New Room | Yes |
| 2 · Designing the team | Yes |
| 3 · The proposed team | Yes |
| 4 · Catalog | Yes |

## Never compared against a drawing

- **The app top bar.** Present in every drawing frame, but it is earlier-issue
  chrome and out of this change's scope. Its brand mark differs from the
  drawing's (`∞` against two drawn diamonds); flagged, not changed.
- **The Workflow Review step.** No frame exists; the drawing lists it under
  "Not drawn: never captured". Its line is `Planning this cost $0.012`, decided
  separately, and its appearance follows frame 3.
- **The Workflow planning skeleton.** No frame exists. It follows frame 2's rule
  through the shared `PlannerWait`; its title has no drawn source.
- **The disconnected-workspace, reconnection and loading states.** Listed under
  "Not drawn" in the issue and out of scope.

## Departures that remain

- **The 9px mono tier is dropped on these surfaces.** `room-mono-micro` hardcodes
  `font-size: 9px` and does not scale. The four surfaces use `font-mono text-xs`
  (10.4px at this root). `room-mono-micro` remains on other surfaces.
- **`Pill` keeps its own size.** `room-kit`'s `Pill` is used by eight surfaces
  outside this change, so its `text-[10px]` was left alone; the Room proposal
  overrides the one pill it draws.
- **`Face` renders 30px, not the drawing's 28px.** `FACE_SIZES` has no 28 and
  this change does not invent one; 30 is the nearest existing size.
- **`PlanMap.tsx`'s map keeps its pixel sizes.** Only its skeleton was in scope;
  the plan map itself is a different surface.
- **Sub-pixel drift from the ladder.** The spacing step is 3.25px at this root,
  so some gaps land one step from the drawing. Accepted: the ladder is what
  follows a theme.
- **Catalog entry order in the capture is fixture order.** The fixture lists the
  official entry first; the drawing groups differently. Not a defect.
