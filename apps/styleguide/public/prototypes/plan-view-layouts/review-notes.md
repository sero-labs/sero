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
