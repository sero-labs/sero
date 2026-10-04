# Sero Architect

`@sero-ai/plugin-architect` is a profile-global built-in plugin for managing a
**product**, not a single task. A user supplies a request and a start cap, and
approves the access once. Architect plans the work, dispatches it to
Orchestrator Workflows and Rooms inside that cap, verifies the result with
runtime-generated evidence and reports it. The user makes the decisions that are
theirs; the owner session runs the project. A project made before delivery
agreements keeps its charter flow, which is deprecated and is not converted.

Design notes, specifications and the build order are in
`openspec/changes/sero-architect/`.

## Layout

```
shared/      project record, index and lifecycle types; paths; kill switch
runtime/     record store, wake scheduler, budget, verification gate (Electron main)
extension/   `architect` (owner session) and `architect_projects` (management) tools, bridged
ui/          projects list, project page, dashboard widget (renderer)
```

## Live work

`host.feedback` holds one bounded snapshot per producer (the owner turn, a
research run, an evidence run) and pushes it on `architect-feedback`. The
`feedback` action adds the snapshots the Orchestrator runtime of the project's
workspace holds for the same project id. The overview, the list and the widget
read only this metadata. Output text is separate: `runtime/work-watch.ts`
forwards the owner's current turn on `architect-owner-live`, and asks the
Orchestrator Room handle for a linked Room's members, only while a Work view
holds a lease.

## Where things live

Persistent data is stored under `<SERO_HOME>/apps/architect/`. The host watches
the index at `state.json` and pushes updates to the UI. The runtime alone
writes full records to `projects/<id>.json`.

## Kill switch

Set `SERO_ARCHITECT=0` or `false` before Sero starts to disable the runtime.
Records remain on disk. Restart Sero after removing the variable to enable
Architect again.
