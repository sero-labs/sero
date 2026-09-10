# Sero Architect

`@sero-ai/plugin-architect` is a profile-global built-in plugin for managing a
**product**, not a single task. A user supplies an idea and a folder. Architect
researches the idea, proposes a charter with milestones and a cost cap, and
dispatches each milestone to an Orchestrator Workflow or Room. It verifies the
result with runtime-generated evidence, releases it through the existing
delivery path, and starts maintenance. The user makes the decisions; the owner
session runs the project.

Design notes, specifications and the build order are in
`openspec/changes/sero-architect/`.

## Layout

```
shared/      project record, index and lifecycle types; paths; kill switch
runtime/     record store, wake scheduler, budget, verification gate (Electron main)
extension/   `architect` (owner session) and `architect_projects` (management) tools, bridged
ui/          projects list, project page, dashboard widget (renderer)
```

## Where things live

Persistent data is stored under `<SERO_HOME>/apps/architect/`. The host watches
the index at `state.json` and pushes updates to the UI. The runtime alone
writes full records to `projects/<id>.json`.

## Kill switch

Set `SERO_ARCHITECT=0` or `false` before Sero starts to disable the runtime.
Records remain on disk. Restart Sero after removing the variable to enable
Architect again.
