# Agent Rooms release and migration notes

## Availability

Room mode is behind the `SERO_ROOMS` feature flag. Set `SERO_ROOMS=1` before
Sero starts to enable the Room runtime and UI. When the flag is off, Sero does
not create a Room coordinator, scheduler tick, or Room state.

Room mode is not yet a general-availability feature. Existing Workflow data
and behavior do not change when Room mode is enabled.

## Start a Room

Open **Orchestrator**, select **Rooms**, and select **New Room**. Describe the
problem, review the proposed team and limits, and then select **Start**.

## Migration from collaboration and debate

The old collaboration and debate chat buttons are removed. They are not
redirected to Room mode. The fixed `CollaborationEngine` and `DebateEngine`
sequences and their state are also removed.

There is no automatic data migration because Room records use a separate data
model. To repeat an old collaboration or debate task, start a Room from
Orchestrator. Use a suitable preset if you want guidance for adversarial or
software-delivery work. Sero still generates the final team for the problem.

