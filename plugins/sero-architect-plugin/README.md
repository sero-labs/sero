# Sero Architect

A profile-global built-in plugin that owns a **product** above the level of one
task. The user gives an idea and a folder; the Architect researches, proposes a
charter with milestones and a cost cap, dispatches each milestone to an
Orchestrator Workflow or Room, verifies the result with evidence it produced
itself, releases through the existing delivery path, and keeps maintaining the
product afterwards. The user is the decision-maker, never the operator.

The design, specs and build order live in `openspec/changes/sero-architect/`.

## Layout

```
shared/      project record, index and lifecycle types; paths; kill switch
runtime/     record store, wake scheduler, budget, verification gate (Electron main)
extension/   `architect` (owner session) and `architect_projects` (management) tools, bridged
ui/          projects list, project page, dashboard widget (renderer)
```

## Where things live

Everything persists under `<SERO_HOME>/apps/architect/`. The index is the app's
state file (`state.json`), watched by the host and pushed to the UI; full
records sit in `projects/<id>.json` and are written by the runtime alone.

## Kill switch

`SERO_ARCHITECT=0` or `false` before Sero starts disables the runtime. Records
are kept and no owner session is woken until the flag is removed.
