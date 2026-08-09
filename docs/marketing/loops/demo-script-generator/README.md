# Demo script generator

Status: local draft — part of the Sero growth campaign (see
`docs/marketing/sero-growth-strategy.md`). Not published to any catalog.

## What it does

Turns one named Sero feature into a filmable 60-second demo shot list. The
loop investigates the feature in this repository (docs, plugin READMEs,
source) so every scene shows real UI and real flows, then writes the shot
list into the workspace.

The output structure follows the strategy's proof demos ("Six proof demos"
section): a one-line hook plus concrete things the viewer must see.

## How to trigger it with an input

The trigger is `manual`. The Orchestrator's manual fire carries no payload,
so the loop takes its input two ways:

1. **Inbox file (primary).** Add the feature to
   `docs/marketing/demo-scripts/inbox.md` under a `Pending` heading — the
   feature name on one line, optional indented notes below it — then run the
   loop. The first step takes the topmost pending entry and moves it to a
   `Processed` section so it is not reused.

   ```markdown
   ## Pending

   Visual browser
     Show the agent spotting and fixing a UI bug it can see.

   ## Processed
   ```

2. **Parked question (fallback).** Run the loop with nothing pending and the
   first step raises a human-input question ("Which Sero feature should this
   demo script cover?"). The loop parks; answer it in the Orchestrator UI and
   the step re-runs with your answer as the feature request.

## Output

One file per run: `docs/marketing/demo-scripts/<feature-slug>.md` with

- a first-person hook line in the strategy's demo style,
- a scene-by-scene shot list with rough timestamps summing to ~60 seconds,
- a "Must be visible" column naming the exact UI per scene — including a
  dedicated visible beat for the approval moment whenever the demo shows the
  agent installing or changing anything,
- a spoken/caption line per scene, short enough to say in the scene's time,
- an honest-caveats section: every timelapse labelled with its real duration,
  required setup named, beta rough edges stated plainly.

## No external side effects

Files in the workspace are the only side effect: the shot list and the
processed marker in `inbox.md`. The loop never posts, publishes, sends,
commits, or touches anything outside the workspace. Delivery destination is
`workspace-files` (non-external, so no send ever happens).

## Files

- `definition.json` — the portable `SharedLoopDefinition` (schemaVersion 1)
- `catalog.json` — catalog entry metadata, in the official catalog's format
