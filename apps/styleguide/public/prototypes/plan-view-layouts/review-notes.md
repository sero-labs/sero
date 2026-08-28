# Workflow plan view — four denser layouts

Static prototype. It compares four replacements for the Orchestrator plan map
(`plugins/sero-orchestrator-plugin/ui/components/PlanMap.tsx`).

Open it at `http://127.0.0.1:5176/prototypes/plan-view-layouts/index.html`, or
from **Saved prototypes** in the styleguide.

## Review question

The map draws one node size for every plan. A long plan must zoom out to fit, so
the titles clip and the state text becomes unreadable. Which layout shows more
useful information for each step, and keeps a long plan readable, without a zoom
control?

## Test data

One plan in every option, so you compare the layout and not the content:
15 steps, 12 stages, 1 fan out (x10), 2 approval gates, 1 branch (one path
skipped), 2 parallel stages, 1 loop back with 1 of 3 traversals used, and mixed
states (done, running, blocked, pending, skipped).

Every option uses the same 1160 by 560 panel. That is the size of the plan map
in the Workflow detail view.

## The four options

| Option | Idea | Steps in the panel | Best for |
| --- | --- | --- | --- |
| A — Flow rail | One row for each step. The graph is a rail in the left margin, the loop back is an arc in the right margin. | 15 steps and 3 stage labels | "What happened, and how long did it take?" |
| B — Serpentine map | The map wraps after 4 stages, like text. The space saved goes into the node. | 12 stages, 3 rows, at 100 percent | "What does the plan do?" |
| C — Ribbon and cards | One strip holds the whole plan. Compact cards below hold the detail. | 30 or more in the strip, 15 cards | Very long plans, and progress at a glance |
| D — Two-column outline | No drawn edges. Order is the column, structure is containment. | 15 steps and 3 group boxes | The most text for each step |

## Information added to each step

The map shows a number, a clipped title, a state word, and marker icons. Every
option adds the execution target (background agent, model, or active session),
the agent role when the planner set one, the outcome or the expected outcome,
the elapsed time, the attempt count, and the structure marks (fan out, gate,
routing variable, branch guard, loop back).

## Deviations from the product, on purpose

- Secondary text uses `--text-secondary`, not `--text-muted`. The product value
  `#71717a` gives 3.9:1 on the card surface, which is below AA for the small
  text these layouts add. `--text-secondary` gives 7.4:1.
- A skipped step keeps a dim treatment. Its effective contrast is 4.1:1.

## Not in the prototype

The prototype is static. It shows no zoom, no selection, no tune expander, and
no retry button. Option A keeps the current select-a-step behaviour, but the
prototype does not demonstrate it.

## Product decisions still open

1. Do the Map and Details tabs stay, or does one layout replace both?
2. Is the loop back common enough to need an arc, or is a label enough?
3. Does the layout stay a user setting, like the direction toggle now, or does
   the plan size choose it?

---

# Pass 2 — the serpentine map (`serpentine.html`)

**Built.** The Orchestrator plan map now uses this design:
`plugins/sero-orchestrator-plugin/ui/lib/plan-map-layout.ts`,
`ui/components/PlanMap.tsx`, and `ui/components/PlanMapCard.tsx`. The
steps-per-row setting is stored in `OrchestratorUiState.planStepsPerRow`. Two
differences from the prototype: a card holds one title line at 1 to 3 steps per
row and two at 4, so a long title never pushes the outcome out of a fixed-height
card; and connectors join consecutive stages, not every `dependsOn` pair.

Route: `http://127.0.0.1:5176/prototypes/plan-view-layouts/serpentine.html`

Option B won the first review. This page answers two follow-up questions with
the same plan and the same panel.

## 1. A tighter card

Same width, same information, 38 pixels less height (112 → 74; 88 at 4 per row
when the title wraps). Each line holds one kind of thing: what the step is, how
it runs, and what it produced.

- The title is the first line, with the state at its end.
- The meta line held the state, the agent, the marks, and the time. It now holds
  the agent and the marks only, so the chips stop touching.
- The elapsed time moves to the end of the outcome line, so it aligns down the
  column instead of floating in the meta line.
- A colour bar on the left edge carries the state as well.
- The outcome is one line with an ellipsis. The old card reserved a second line
  that most steps did not use, which made the empty space at the card foot.

### Where the state goes — decided: A

The page keeps all four positions as the record of the comparison. Each shows a
done step, a running step, and a blocked step:

| | Position | Cost |
| --- | --- | --- |
| A | At the end of the title line — **chosen, and used by every map on the page** | Takes about 70 px from the title, so more titles wrap at 4 per row |
| B | On the left colour bar only, with the word for running, blocked, or failed | The word is absent on a done step |
| C | On its own line above the title, with the stage tag | The card grows by one line |
| D | In front of the outcome | Shortens the outcome text |

Position A drops the stage tag from a step card. A parallel or branch box keeps
its tag, because the box labels the stage.

## 2. Steps per row, 1 to 4

The control replaces the Auto, Horizontal, and Vertical buttons. Each setting is
drawn on its own, because the prototype is static.

| Setting | Card width | Rows | Result |
| --- | --- | --- | --- |
| 4 | 258 px | 3 | 12 of 12 stages, no scroll. Titles wrap to 2 lines. |
| 3 | 345 px | 4 | 12 of 12 stages, no scroll. Titles fit on 1 line. |
| 2 | 532 px | 6 | 8 of 12 stages, then it scrolls. |
| 1 | 1094 px | 12 | 7 of 12 stages, then it scrolls. The card becomes one line. |

Two behaviours follow the setting:

- **The wrap line.** A dashed, labelled line leaves the row on the right and
  enters the next row on the left. At 1 per row there is no wrap, so a straight
  arrow joins each card to the next.
- **The loop back.** When both ends sit in one row (4 per row), it draws as an
  arc under that row. When the loop crosses a row boundary (3 per row or fewer),
  it runs down a rail in the left margin and returns to the target stage from
  below.

Cards are centred in their row, so a single stage next to a parallel stage keeps
its arrow on the flow line.

At 1 step in a row, every step is a full-width row on the same fixed columns —
number, title, state, agent and marks, outcome, time, stage. A parallel or
branch box holds full-width rows too, so the columns align down the whole map.
Before this, each card sized its own columns from its content, and nothing lined
up between rows.

## Product decisions still open

1. Is the default 4 (most plans fit) or 3 (titles stop wrapping)?
2. "Steps per row" is the user's word. A column holds one stage, and a parallel
   stage puts two steps in one column, so the exact word is "stages per row".
3. The setting must persist in `~/.sero-ui/layout.json`, like the other view
   settings.
4. Does every wrap need its label, or only the first one?
Decided: the state goes beside the title (position A).

---

# Pass 3 — production review

The static page above keeps the Pass 2 comparison. Review with real Workflow
data changed the production card in four ways:

- The outcome and elapsed time now sit between the title and the execution
  marks. The marks stay on the bottom line.
- Cards use more space between lines and less vertical padding. Outcomes can
  wrap to two lines. Single cards are 100 pixels high, or 118 pixels when a
  narrow card reserves two title lines. A step in a grouped stage is 98 pixels
  high.
- One-stage rows use the same three-line card as the other settings and use the
  available panel width without adding a horizontal scrollbar.
- Selection uses one inset border. It does not add a second border outside the
  card.
- The Map/Details selection is a profile preference. It follows the user across
  Workflows and workspaces.

The production layout also labels a dependency level as a branch only when all
steps use the same routing variable. A level with unrelated guarded or
unguarded work uses the neutral "Same stage" label, and each guarded card names
its own routing variable.
