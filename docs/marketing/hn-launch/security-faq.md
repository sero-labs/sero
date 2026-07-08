# Draft: Security FAQ for HN launch (task 5.2)

Status: DRAFT — Agent→Dan. This is the pre-written answer bank for the HN comment
thread (and any Reddit/Discord follow-up). Each answer is honest, specific, and
grounded in the shipped product — README trust section (lines 145–188),
[SECURITY.md](../../../SECURITY.md), the
[Security & Privacy reference](../../../apps/docs-site/docs/reference/security-privacy.md),
and the release audit's evidence-based signing facts. Don't defend; explain. If a
question exposes a real gap, concede it and say what's planned.

Posture: Sero is a **power-user tool** that deliberately gives agents real
surfaces. The safety story is local-first control, visible approval points,
signed builds, and honest docs — not pretending the power surfaces don't exist.

---

## The self-extending workspace

**"An AI that writes and runs its own code inside your workspace — isn't that
exactly the scary part?"**

It's the powerful part, and the reason there's a human approval step in the
middle. Sero writes the plugin; you review the code and explicitly approve it
before it's installed and mounted — the same review you'd give any dependency
you add. Nothing self-installs silently. The demo makes that approval moment
visible on purpose: "self-extending workspace" is exciting, "uncontrolled agent
modifies itself" is a trust problem we designed out.

**"Can a plugin run arbitrary code?"**

Yes — plugins are real software (Pi extension code plus optional UI), not
sandboxed config. That's what makes them useful. Treat installing one exactly
like adding a dependency: review it first. We're building the plugin ecosystem
around reviewable, open examples for this reason.

## Terminal and file access

**"So the agent has my terminal and filesystem?"**

Within the workspace you give it, yes — that's the point of a workspace agent. A
permission gate prompts on dangerous shell patterns (recursive deletes, `sudo`,
disk writes, and similar). It does **not** prompt on every action; it's a
power-user tool and the docs say plainly what is and isn't gated, so you can
decide if that trade-off fits you. If you want stronger isolation, run the
workspace in a container runtime (Apple Container, Docker/Podman) rather than on
the host.

**"Can I inspect, pause, or stop what it's doing?"**

Every session and loop is visible in the UI. Loops block and wait at decision
points rather than pushing through, and the built-in Admin surface exposes
sessions, config, and logs. You're never guessing what ran.

## Loops and automation

**"Long-running autonomous loops sound like they'll do something irreversible
while I'm asleep."**

Loops are plans you review and explicitly activate — they don't auto-start. When
a loop hits an outward side effect (email, chat message, webhook, posting
anywhere) it shows you the exact content and waits for approval. Loops that hit a
decision point stop and ask. The growth/social loops we built for this very
campaign produce drafts only; none of them post automatically.

## Data and privacy

**"What actually leaves my machine?"**

The app, your workspaces, agent sessions, memory, plugin state, and logs all live
in a local profile directory. The one thing that leaves by default is the model
API call — your prompt and workspace context go to the provider you configure. If
you don't want even that to leave, point Sero at a local OpenAI-compatible server
(Ollama, LM Studio, vLLM) and nothing goes out. Optional integrations (GitHub,
Discord, Tailscale, plugin installs) only talk out when you enable them. Remote
control via the gateway is **off by default**. There is no telemetry backend
collecting your sessions.

**"Where do my API keys live?"**

In local files under your profile (`<SERO_HOME>/agent/`, key file `chmod 0600`),
never synced anywhere by Sero. Treat the profile directory as sensitive — it's
documented in the security & privacy reference. When you share logs or
screenshots, redact tokens and private paths.

## Builds and supply chain

**"Are the builds signed? Can I trust the binary?"**

macOS (Apple Silicon) builds are code-signed with a Developer ID certificate and
notarized by Apple — verifiable in the CI logs. Windows and Linux builds are
**not** signed during the beta, so Windows will show a SmartScreen "unknown
publisher" prompt on first launch. We'd rather say that plainly than overclaim.
It's open source, so you can also build from source and run that.

**"Why should I trust a beta with this much access?"**

You shouldn't extend more trust than the evidence earns — which is why the whole
thing is open source, local-first, signed on macOS, and honest about what's
gated. Start it in a container runtime, point it at a throwaway project, use a
local model, and see how it behaves before you give it anything real.

## If pushed on a real gap

- **Windows/Linux signing:** not done in beta — acknowledged, on the list.
- **Per-action gating:** intentionally not prompt-on-everything; that's a
  power-user choice, documented, and a container runtime is the stronger-isolation
  answer.
- **Plugin trust:** no plugin sandbox — plugins are code you review, same as any
  dependency; we're leaning on open, reviewable examples rather than claiming a
  sandbox we don't have.
- **API stability:** plugin and loop APIs aren't stable yet — say so; don't
  imply they are.

Full details to link in-thread: [SECURITY.md](../../../SECURITY.md),
[Security & Privacy reference](../../../apps/docs-site/docs/reference/security-privacy.md),
[gateway security](../../../docs/security/gateway.md).
