# Rooms in practice

This page covers what you do once a Room is running: keeping two members out of
each other's files, granting access it did not start with, changing the team
while it works, and getting the result out.

It assumes you have been through the [Rooms tutorial](/guide/rooms). For exact
statuses, fields, and limits, see the [Rooms reference](/reference/rooms).

## Keep members out of each other's way

### Give each editor its own copy of the repository

A member that edits normally gets a **worktree** — its own copy of the
repository, on its own branch. Two members can then work on the same repository
at the same time without either one seeing the other's half-finished changes.

The proposal names which arrangement it chose:

| Mode | Use it when |
| --- | --- |
| `worktree-per-member` | anyone edits files. This is the normal choice |
| `read-only-shared` | nobody edits — an investigation or a review |
| `shared-working-tree` | you specifically want the members working in your own files |

`shared-working-tree` needs your explicit approval, because the members change
the files you have open. Prefer a worktree unless you have a reason not to.

### Claim a file before you work on it

A **claim** is a member saying "I am already in this file". It is a courtesy, not
a lock: each editing member has its own copy of the repository, so overlapping
work cannot corrupt anything — Git sorts it out later. What a claim prevents is
two members each spending a turn on the same change.

A claim names a file, a folder, or a pattern such as `src/*.js`, and a reason.
The Room decides what happens when two claims overlap:

- **warn** records the claim and tells the member who else is already there. The
  two of them sort it out through the Room.
- **block** refuses the whole request, so a half-applied set of claims never
  exists.

Overlaps are only tested against *other* members' active claims. A member
re-claiming its own path is not in conflict with itself, and a member that
retires releases everything it held.

When you see two members claiming the same file, you rarely need to intervene —
that is the mechanism working. Step in when they are still both there a turn
later.

## Grant access the Room did not start with

Access levels decide which Sero tools a member holds. **Edit workspace** gives it
the file tools; **edit and push** adds the ones that publish. When a member needs
a level it was not given, it asks, and the Room waits.

Approving raises the access for that member. Rejecting keeps the current limits —
the Room carries on with what it has, and the member has to deliver another way.
The same applies to more time, more money, more members, and a new delivery
destination.

Two rules never bend. A member cannot approve its own request, not even the
Conductor. And a member can never give itself or anyone else more access.

### Access is not a sandbox

An access level selects tools. It does not confine the member. A member that
holds the shell can run any command your account can run, including `git push`
and `gh`, whatever its access level says. Treat the level as a statement of
intent, and give a Room the shell only in a repository you are willing to let it
change.

## Change the team while it works

The Conductor can adjust the team inside the limits you approved: change what a
member is working on, its priorities and instructions, and add, retire, suspend,
or resume members.

- **Suspend** stops a member taking turns but keeps its session, so it can be
  resumed with its memory intact.
- **Retire** ends a member's part in the Room and releases its claims.
- **Add** brings in a new member — allowed while the team-size and cost limits
  permit it.

Anything that costs more than you approved comes to you as an approval. So does
replacing the Conductor, because that is the member deciding when the work is
done.

## Send direction to a running team

Use a message when the team is heading the wrong way, or when you know something
they do not.

- **Now** wakes or interrupts the named members. Use it to stop work you can see
  is wrong.
- **Next turn** adds your message to the member's next turn without starting one.
  Use it for context that can wait — it costs nothing until the member works
  again.

Watching a Room costs nothing. Only a turn costs money.

## When a Room stops

The Room says why. The usual reasons are that it reached its time or cost limit,
it is waiting on your answer or approval, members are waiting on each other, the
Conductor could not continue, or Sero restarted while members were working.

Read the notice before you resume. Resuming without changing anything usually
reproduces the same stop.

After a restart, Sero checks the saved Room against its member sessions and their
copies of the repository, and clears any turn that was cut short. The Conductor
works out what still needs doing. Nothing is lost: what the members said and what
they committed both survive.

## Get the result out

The proposal fixes one delivery destination. A pull request is the usual choice
for code; a Room started from chat also returns one final answer to that chat.

Delivery to anywhere outside Sero needs your approval, and Sero records a
reference — a pull request URL, for instance — when the destination gives one.

A finished Room shows its result, its artifacts, anything left unfinished, and
what it cost. **Artifacts** are what the members wrote down as results: plans,
patches, test runs, reviews, the pull request. Read the unfinished items before
you use the result — a Room reports what it could not do rather than quietly
dropping it.

## Keep or remove a finished Room

**Archive** keeps the Room in the list and drops older retained activity. Use it
once you have taken what you need but want the record.

**Delete** removes the Room record permanently. The members' sessions are kept
for as long as Sero keeps any session, so deleting the Room does not delete what
its members did.

Check the result and the artifacts before either. Deletion cannot be undone.

## Where next

- [Rooms tutorial](/guide/rooms) — the walkthrough, if you skipped it.
- [Rooms reference](/reference/rooms) — statuses, access levels, claim fields,
  artifact kinds, tool actions, and storage paths.
- [Workflows](/guide/workflows) — for work that can be planned in advance.
