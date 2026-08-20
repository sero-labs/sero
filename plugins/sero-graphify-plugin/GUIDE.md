# Graphify Plugin — A Plain-English Guide

## What it does

Sero now has a built-in app called **Graphify** that reads your projects and
builds a "map" of each one — what the important pieces are, and how they
connect to each other. Think of it like an automatically-generated wiki
diagram: "the login handler talks to the auth service, which stores tokens
here."

It does this for every project you opt in, then **combines all those maps
into one big map covering everything you work on**. So the AI can answer
questions like "which of my projects handles billing?" or "how does X connect
to Y?" without digging through files.

## How you use it

**The panel.** There's a Graphify page in Sero's sidebar. It lists all your
projects with a toggle next to each. Flip the toggle on a project and
Graphify reads it and builds its map in the background — you can watch the
progress (queued → building → indexed) and see how big the map turned out and
roughly what it cost to build. There's also a search box that asks questions
across all your mapped projects at once.

**Asking the AI.** In any chat session, the AI now has new abilities:

- **Search everything** — ask a question across all your projects
- **Ask about this project** — get the map for whatever project you're
  currently in
- **Connect two ideas** — "what's the chain between the invoice job and the
  token store?"
- **Explain one thing** — "tell me everything connected to AuthService"
- **Manage indexing** — the AI can turn indexing on/off for projects if you
  ask it to

**Automatic help (the part you don't see).** When you start a session in a
mapped project, the AI quietly gets a one-time orientation: "this project has
a map, here's the summary, use it instead of rummaging through files." And
when the AI does a big sprawling search, a small note gets attached
suggesting it consult the map instead. This is deliberately stingy — it has a
strict budget per session, never repeats itself, and does absolutely nothing
if no map exists.

## What happens behind the scenes

- The actual map-building uses an open-source tool called Graphify, which is
  a Python program. Sero **installs it for you automatically** the first time
  you flip a toggle — you don't need Python or anything set up.
- Building a map for the first time uses an AI model to read your code, so it
  costs a little money (it uses the API key you've already given Sero).
  That's a **one-time cost per project** — after that, updates are quick,
  local, and free, and happen automatically the moment the AI finishes a
  round of edits in that project (plus a quick catch-up when Sero starts).
- All the maps live in Sero's own folder, **never inside your projects** —
  nothing gets added to your repos, nothing to gitignore.
- If you run projects inside containers for isolation, everything still works
  the same — the heavy lifting always happens on your machine, and sessions
  only need to *read* the finished maps.

## What it costs, and what stops it

Making the map is the only part that uses the AI model. Searching it, updating
it after you edit files, and merging your projects together are all local and
free.

- **You choose the model.** Graphify does nothing until you pick a backend and
  a model in the panel. It never falls back to a default, because then nobody
  can say what a build cost.
- **You see the price first.** Before each build Graphify counts the files and
  the bytes it will read, works out what that costs with your model, and asks.
  If it does not know your model's price it says so, and still asks.
- **Limits stop it.** $2 for one build, $10 for one day, 5000 files. When a
  limit stops a build, Graphify says which one and does not try again.
- **Restarting never spends.** A project that has never been built waits, and
  so does one whose build failed. You press the button.
- **A failed build still counts.** A build can use the model and then fail, so
  Graphify records what it was allowed to spend before it starts. A failure
  that never reached the model is not counted.
- **Community names are not made yet.** That is a second use of the model, and
  its cost is not in the estimate, so your graph uses `Community 1` and so on.
- **Pause** stops all paid work at once.

## Sensible defaults & safety

- Nothing is mapped unless you opt in, per project (or click "Index all").
- Junk is skipped automatically (node_modules, build output, lockfiles).
- Your global workspace — where your memory files live — is never mapped. It is
  dense writing, and it would cost far more than its size suggests.
- If a build fails (no API key, network down), that project shows the error and
  a **Try again** button — other projects keep going.
- If a map is missing or broken, every feature quietly says "not indexed yet"
  rather than breaking anything.

## What's left to try by hand

Everything is built and tested (83 automated tests on the plugin alone), and
the background piece was confirmed to start up and find all profile
workspaces in the real app. Still to check manually: flip a toggle on a real
project with an API key and watch a full build go through, and confirm
container sessions can read the maps. That's a 10-minute check next time the
dev app is open.
