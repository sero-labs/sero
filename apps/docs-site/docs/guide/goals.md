# Goals

A Goal keeps your current chat session working toward one result. You say what
must be true at the end. Sero keeps the session going after each reply until
that is true, until a limit is reached, or until you stop it.

Use a Goal when the result is clear but the route is not. Use a
[Workflow](/guide/workflows) when Sero can plan the steps first. Use a
[Room](/guide/rooms) when the work needs several agents.

| | Goal | Workflow | Room |
| --- | --- | --- | --- |
| Sero creates | Nothing to review first | A plan of steps | A team of agents |
| Work happens | In your chat session | Step by step | Members share findings |
| Use it for | One result, unknown route | A task with clear stages | A task that needs several roles |

## Start a Goal

Type `/goal` in the chat session you want to run, then the result you want:

```text
/goal get the release build green
```

Add the checks that must pass after two hyphens. Separate them with semicolons:

```text
/goal get the release build green -- pnpm build exits zero; no new lint errors
```

Sero starts the Goal in that session and tells the agent what it must achieve.
The agent then keeps working after each reply.

## What the agent may do

A Goal gives the agent no new tool, no new approval and no new permission. It
gets exactly the access the session already had. If your access settings hide
the tools a Goal needs to stop itself, Sero refuses to start the Goal and says
which tool is missing.

The result you type is treated as task data. An instruction inside it to widen
the agent's access is reported to you, not obeyed.

## Stay in control

- **Send a message.** Your message always wins. Sero cancels the next automatic
  turn instead of racing it.
- **Press Escape.** The Goal pauses at once and is not started again until you
  resume it.
- **Use the commands.** `/goal status`, `/goal pause`, `/goal resume` and
  `/goal stop` all work in the session that holds the Goal. `/goal list` shows
  every Goal in the workspace.

A session runs one Goal at a time. A Goal also cannot run in a session that a
Workflow step is already driving, and the reverse is true. Sero refuses the
second one and says which one holds the session. A Goal holds the session only
while it runs: pause or stop it and the session is free again.

`/goal pause`, `/goal resume` and `/goal stop` control the Goal of the session
you type them in. Use the Orchestrator to manage a Goal you left running in
another session.

## Limits

Every Goal has budgets, counted separately:

- automatic turns, 25 by default;
- total tokens;
- cost;
- active time.

Only the turns the Goal itself starts are counted. Your own messages are free.
A turn the Goal started still counts if you cancel it or send a message over
it, because it has already used what it used. Change the turn budget with
`/goal turns 40`.

Reaching a budget stops the Goal. **It is not success.** Sero says which budget
was reached, and the Goal stays stopped until you raise it and resume.

A cost budget bounds the Goal's own turns. It is not a guaranteed spend
ceiling, because one turn can run a long sequence of tools before the budget is
checked again.

Sero also holds a Goal that repeats itself. Three replies with the same result
and no attempted tool pause it, so a turn budget is not spent on an agent that
is stuck.

## How a Goal ends

The agent ends a Goal with an explicit report, never by going quiet:

- **Reported complete.** The agent says every check is met and gives its
  evidence. Sero records the claim. Read the evidence before you trust it —
  nothing checks the claim for you yet.
- **Blocked.** The agent cannot continue without you. Sero notifies you and the
  Goal waits for your answer.
- **Waiting.** The agent must wait for something outside the session, such as a
  check finishing. Nothing restarts a waiting Goal for you yet, so resume it
  when the condition is met.

A Goal survives a restart. Sero re-checks every budget before anything resumes,
so a Goal that used its budget while Sero was closed comes back stopped.

## Turn Goal mode off

Set `SERO_GOALS=0` before Sero starts. Goal records are kept. Workflows and
Rooms are not affected.
