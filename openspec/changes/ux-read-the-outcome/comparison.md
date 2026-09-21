# Matching the drawing

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/3-read-the-outcome.html`.
Its four frames and its Decisions are binding.

Frames 1, 3 and 4 were captured and read beside the drawing; frame 2 was not. Every
capture found at least one real defect. The footer table, *What is captured, and what
was checked by eye*, says which frame was settled how.

## How the captures were taken

- Orchestrator: `pnpm --filter @sero-ai/plugin-orchestrator preview`, panel width
  1440, screenshotted at a 1600 viewport so the 1440 panel is not clipped by the
  page's own padding. Playwright CLI
  (`playwright screenshot --viewport-size=1600,1400 --full-page`), not agent-browser.
- Three previews were added for this change — `loop-ending`, `room-result`,
  `member-info` (`ui/__preview__/read-the-outcome-fixture.tsx`). Each renders the
  REAL component; a preview that re-draws a surface proves nothing about it.
  `LoopResult` moved to its own module so the preview can render the real row.
- The drawing was screenshotted at 1440 from `file://`, and the two were read
  side by side, frame by frame.
- Every fold was opened in the drawing and in the build before comparing.

## Defects the captures found, and what was done

These are faults no test in this change caught. Each was found by looking at the
capture.

| Frame | What the capture showed | Outcome |
| --- | --- | --- |
| 4 | Every `Kv` value was pushed to the far right of a 1188px column, and long ones were cut by `truncate`. The drawing puts the value in a fixed 120px label column beside the label. | Fixed. `Kv` is the drawing's grid: a 120px label column, and the value wraps instead of clipping. |
| 4 | The spend ring floated at the right with no column of its own. The drawing puts it in a 240px column with a left hairline and a raised background. | Fixed. The ring sits in that column. |
| 4 | `ACCESS` read `read-only · no worktree`; the drawing reads `Read-only · no worktree`. | Fixed. The permission id is capitalised into a word. |
| 3 | `Delivered` printed `To workspace-files · 9/11/2026, 10:15:02 PM` — the raw destination id and a full locale stamp. The drawing reads `To workspace files · 16 Sep, 23:13`. | Fixed. The id's hyphens are opened out and `formatDayTime` prints the drawing's stamp. |
| 3 | The plan card rendered its title and **no sections at all**. | Fixed in the harness, not the product: the fixture set its bridge with `??=`, and another fixture had already created one, so `invokeTool` was missing. It now assigns onto the existing bridge. The capture is what exposed it — the surface looked correct in tests. |
| 1 | The first capture was clipped at the right edge. | Fixed in the harness: capture at 1600 for a 1440 panel. |

## Differences that remain

- **Frame 1 has no state line.** The drawing shows
  `Complete · 4 of 4 steps finished · 10 days ago · 1 run`. This is #537's recorded
  departure, kept: every step card reads Done, and the Attempt history fold counts
  the runs, so the line was pure repetition. This change did not reverse it.
- **Frame 1's settings columns are not the drawing's.** The build shows
  `CONTEXT` and `RESULTS TO Pull request (auto)`; the drawing shows `WORKSPACE FILES`
  and no `CONTEXT`. That line is #537's surface and is out of this change's scope.
- **Frame 3 lists the other artifacts in record order.** The build lists
  `Workspace audit and conditional Canvas direction` then
  `Pulse proposal: Signal Wake Crossing`; the drawing lists them the other way. The
  record's own order is deliberate — it is the order they were published, and no
  ordering rule is stated in the issue. Flagged rather than guessed.
- **Frame 3 shows the plan file's own heading.** The card's title is the artifact's
  recorded title (`Final proposal: Signal Wake Crossing`, as the drawing has it), and
  the file's `#` heading
  (`Frogger: Neon Crossing — product and implementation direction`) is shown beneath
  it. The drawing omits that line. Keeping it is the "nothing is lost" rule — the two
  strings are different text, not a repeat.
- **Frame 2 is not captured.** No Architect preview exists for the stopped-and-passed
  milestone surface, so it was not put beside the drawing. The work behind it is
  tested (`dispatch-watch.test.ts`, `activity.test.ts`, `project-controls.test.tsx`,
  `milestone-rail.test.tsx`) but the drawn appearance of that screen is unverified.

## Departures taken knowingly

- **The stop reason is not filed as the Architect's report.** `stateLine` feeds
  "What Architect reported, in its own words", and a stop reason is not something
  the Architect said. The reason rides the activity line only.
- **Frame 2's activity line carries the owner suffix.** The drawing reads
  `Sero restarted during step 1 of its Workflow · 10 days ago`; the built line appends
  `· Architect idle`, which every other state on that page also shows.
- **Cost-by-member rows are controls.** The drawing's `.costs` is a plain `dl`. The
  task requires each row to open that member, so each name is a button inside the
  two-column list. The drawn geometry is unchanged.
- **Amber is used from 80% of a member's limit, red only at it.** The drawing rings
  one over-limit member red. The shared `spendTone` (now in `@sero-ai/common`)
  returns `warn` from 80% and `err` at the limit — the same rule the project and the
  Room use, which the Decision asks for over matching one example.
- **A Workflow stopped at its own cap gets a field, not a button.** The drawing does
  not cover this case; the control moved whole from the milestone row.
- **Relative times use the app's format.** The drawing reads "10 days ago"; the
  Architect uses `relativeTime`.

## Parity, screen by screen

**Frame 1, the Workflow.** Captured and compared.

- Drawing: State line, Result, settings, Objective, then the steps.
- Built: Result, settings, Objective + request chevron, plan. The state line is the
  recorded departure above. The Result row sits above the settings, as drawn, and
  prints the run's own reason.
- Retry step on a blocked step is unchanged. Delete stays in More actions.

**Frame 2, the Architect.** NOT CAPTURED. Reachable controls are covered by tests:
Retry step moved from the milestone row to the header (`milestone-rail.test.tsx`
asserts the row no longer offers it), the reason appears once on the activity line
(`project-controls.test.tsx`), and evidence renders one row per check with each
output behind its own fold (`view-model.test.ts`, `milestone-rail.test.tsx`).

**Frame 3, the Room.** Captured and compared. Back to Rooms, Result, Timeline, Watch,
the member rows and Open in Agent Board are unchanged. Delete Room moved into the ⋯
menu. The plan leads, opens at `Decision`, and its other nine sections fold. Each
artifact keeps a control that opens its file. `Cost by member` folds with the total
in its summary.

**Frame 4, the member.** Captured and compared. Session and Info, Close, the member
rows, Open in Agent Board and Brief are unchanged. `MODEL`, `TOOLS`, `ACCESS`, `ROLE`
and `RESPONSIBLE FOR` lead, then the two folds, with the ring in its own column. The
member header still reads `started 14:12 · 1 turn`.

## What is captured, and what was checked by eye

| Frame | Captured? | How the drawn appearance was settled |
| --- | --- | --- |
| 1, a finished Workflow | Yes — `loop-ending` | Read beside the drawing, differences fixed and recorded above. Checked manually by the user in the app. |
| 2, a stopped and a passed milestone | **No** | No Architect preview exists for that surface, so there was nothing to point a browser at. Checked manually by the user in the app. The logic is covered by `dispatch-watch.test.ts`, `activity.test.ts`, `project-controls.test.tsx`, `milestone-rail.test.tsx` and `view-model.test.ts`. |
| 3, a Room's result | Yes — `room-result` | Read beside the drawing. Found and fixed two real defects (above). Checked manually by the user. |
| 4, a member's Info tab | Yes — `member-info` | Read beside the drawing. Found and fixed three real defects (above). Checked manually by the user. |

The one gap worth naming: **frame 2's drawn appearance has never been compared side by side.** Its behaviour is tested and the user checked the screen, but nothing put it next to the drawing. Adding an Architect preview for that surface is the way to close it.

The captures themselves were taken into `/tmp` and are not committed; the previews that produce them are, so each can be re-taken with
`pnpm --filter @sero-ai/plugin-orchestrator preview` and `?preview=loop-ending|room-result|member-info`.
