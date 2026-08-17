# Orchestrator

Orchestrator runs work that is too big for one agent turn. It has two modes, and
the right one depends on what the work is like — not on how large it is.

Open Orchestrator from the app bar, then choose **Workflows** or **Rooms**.

## Two kinds of work

**You know what the finished result looks like.** "Check every level is solvable,
fix the ones that are not, and open a pull request." The result is clear, the
work can be laid out in advance, and you want to see the plan before it runs.
That is a **[Workflow](/guide/workflows)**: Sero writes a plan of steps, you read
it and approve it, and it runs — once, on a schedule, or when something happens.
It can pause to ask you, branch on what it finds, and loop back when a check
fails.

**You know the problem but not the shape of the fix.** "Payment totals drift by a
cent under load, and it could be the rounding, the migration, or the retry."
Nobody can write the steps yet, because the first finding changes the second. The
work needs people looking at different parts of it and telling each other what
they find. That is a **[Room](/guide/rooms)**: Sero designs a small team, you
approve who is in it and what each member may touch, and they work together —
asking each other questions, dividing the files, and reporting back.

| | Workflow | Room |
| --- | --- | --- |
| Written in advance | a plan of steps | a team and a brief |
| Runs | in order, with branches and loops | as members pick up work |
| Members talk to | you | each other, and you |
| Best for | repeatable, describable work | investigation and open-ended fixes |

You do not need a Workflow before you start a Room. They are independent.

## What stays under your control

Both modes show you what they intend to do before they do it — where the work
happens, what it can reach, where the result goes, and the limits it runs under.
Sero asks before it delivers a result anywhere outside your workspace.

That is a limit on the tools Sero hands out, not a cage. Work that holds the
shell can run any command your account can run. Point Orchestrator at a
repository you are willing to let it change.

Work stops and waits for you when it needs:

- an answer to a question;
- approval for a change you asked to be told about;
- more time, money, access, or people;
- help after something failed.

You can close the panel while work continues. **Home** gathers everything waiting
on you, and Sero notifies you when something finishes or gets stuck.

## Start here

- [Create and run a Workflow](/guide/workflows) — the tutorial.
- [Workflows in practice](/guide/workflows-advanced) — schedules, recovery,
  Library and Catalog.
- [Create and run a Room](/guide/rooms) — the tutorial.
- [Rooms in practice](/guide/rooms-advanced) — claims, asking for more access,
  and changing a team while it works.

For exact tool names, commands, and compatibility terms, see the
[Orchestrator reference](/reference/orchestrator), the
[Workflows reference](/reference/workflows), and the
[Rooms reference](/reference/rooms).
