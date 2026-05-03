# Agent Flight Recorder Plugin

**Agent Flight Recorder** is a Sero plugin that turns an agent session into a replayable, visual activity timeline.

Instead of the session being only a chat transcript, it shows the actual shape of the work:

- what the user asked
- what the agent planned
- which tools it used
- which files it read or edited
- which commands it ran
- where it failed
- where it recovered
- what changed in the workspace

The UI could look like a “black box recorder” for coding agents: a vertical timeline with grouped events, colored markers, expandable tool calls, file-change badges, command outputs, and checkpoint moments.

The agent could also summarize the session afterward:

> “In this run, I updated the launch article, created two docs files, and proposed three plugin demo ideas. No source code was changed.”

## Why it is compelling as a Sero demo

**It makes agent work observable.**

Most AI coding tools hide the workflow inside a scrolling chat log. Flight Recorder reframes the agent as something operating inside a real workspace, with inspectable state, actions, and consequences.

Useful demo features:

- session timeline
- filters for files / commands / tools / errors
- “what changed?” summary
- risk markers for destructive commands or failed tests
- checkpoint/restore markers
- exportable run report
- “ask agent to explain this run” button
- dashboard widget showing latest session activity

## Simple v1

A simple v1 could be very achievable:

1. Store manually recorded events through a `flight_recorder` tool.
2. Let the agent call the tool after important actions.
3. Render those events in a polished timeline UI.
4. Add a `summarize` action that produces a concise session report.

Later, it could become deeper by listening to Sero/Pi event streams automatically, but the demo version doesn’t need that. The important thing is the product story:

**Sero can give agent work a visible, persistent interface instead of leaving it buried in chat.**
