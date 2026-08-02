# Ink & Bones — a second Sprite Studio mode (spike findings)

**Status: spike complete. Working TypeScript proof of concept at
`spikes/ink-and-bones/` (open `index.html` in a browser).**

Sprite Studio today makes sprites from **video**: a fal model draws a clip,
we measure it, extract frames, and repair the bad ones. The Godot "CyNinja"
demo (`repos/cyninja-prompt-demo`) takes the opposite road: **every frame is
drawn by code**. A character is a *program* — a skeleton, painted parts, and
motion curves — and the AI writes the program, not the pictures. This
document answers three questions about bringing that in as a second mode:
is it possible, how complex is it, and should we do it.

## a) Is it possible? Yes — proven.

The Godot pipeline uses **no engine features at all**: only pixel buffers,
2D affine transforms, and hand-written math (2-bone IK, verlet cloth, box
downsample, palette quantize, despeckle, outline). Godot is just its script
runtime. The spike ports the four core modules (`skeleton.gd`, `paint.gd`,
`motion.gd`, `compositor.gd`, ~1,000 lines of GDScript) to ~1,100 lines of
dependency-free TypeScript, plus one original demo character.

Measured results from the spike, in the browser, single-threaded:

- A 64×80 character with 14 painted parts, IK legs and arms, and a
  simulated scarf bakes at **~3 ms per frame** (a 19-frame idle: 50 ms; a
  9-frame run: 18–45 ms). The Verlet warm-up (16 cycles at 60 Hz) is
  included in those numbers.
- Bakes are **deterministic** — same source, same frames, every run.
- Output is already palette-exact: every pixel comes from a declared ramp
  plus one ink colour. This drops straight into Sprite Studio's indexed-PNG
  store (D2) with **no quantization step at all** — the palette is known
  before the first pixel is drawn, rather than measured after.
- A mirrored clip (`run_west`) is one line. A re-theme (full palette swap)
  is a rebake, ~20 ms. A stride or wind change is a one-line diff.

## b) Complexity

Three separately sized pieces:

1. **The engine (small, done once).** The spike is most of it. Missing
   pieces are mechanical: the audit checks (`puppet_audit`'s eight
   per-clip gates — wrap, islands, in-place, baseline, edge, speckle,
   ramp), the layered z-order override, and export into the existing
   frame store. Estimate: the spike ~×2. No research risk left — the hard
   parts (IK conventions, the grade, cloth stiffness) are ported and
   verified on screen.

2. **The authoring surface for the AI (the real work).** In this mode the
   LLM writes and edits a character file against the authoring API. The
   CyNinja repo proves models can do this well, but it converged because of
   its **feedback loop**: headless audits that measure the result plus
   review renders a model can look at. We must port that loop, not just
   the renderer. The audits are pure math over the baked frames, so they
   port the same way the engine did. The loop then runs entirely inside
   Sero's background runtime — bake, audit, look at the strip, edit,
   repeat — with no per-iteration cost.

3. **Sprite Studio integration (bounded, follows the existing shape).**
   The current checkpoints map one-to-one: the character sheet gate becomes
   "approve the rest pose + palette"; the animation review gate becomes
   "approve the baked clip". The state machine, review UI, and store need a
   `mode` discriminator and a bake step where the video pipeline has its
   measure/extract/repair steps. The frame player, backdrop picker, loop
   controls and export all work unchanged, because frames are frames.

What this mode does **not** need: clip purchases, frame extraction, the
repair endpoint, hand-picking frames out of a noisy take. Its costs are
LLM tokens only.

## c) Should we do it? Yes, as a mode beside video — not a replacement.

The two modes fail in opposite ways, which is exactly when a second mode
earns its place:

| | Video mode (today) | Ink & Bones mode |
| --- | --- | --- |
| First result | fast, often beautiful | needs iterations to look good |
| Consistency across frames/clips | the hard problem (repair, review) | structural — same function, same face |
| Edits ("longer scarf") | regenerate and hope | one-line diff, 20 ms rebake |
| New clip for an existing character | new clip purchase + review | author curves only; art is reused |
| Marginal cost | $ per clip | tokens only |
| Ceiling | whatever the model can draw | what code can draw — stylised, clean, but not painterly |

The fit with the AI-first workflow is strong, and it answers the stated
goal — less reliance on video/image repair — directly: there is nothing to
repair, because nothing is sampled. fal models still have two natural
places: **concept art in** (generate a reference image the puppet is
authored to match, reusing the existing ingestion) and **judgement**
(vision models scoring the baked strips, beside the deterministic audits).

Risks, honestly: the look has a ceiling — geometric paint plus a grade
reads clean and stylised, not hand-painted; a character file converges over
multiple authoring iterations, so first results will be rough; and cloth
and gait tuning have real craft in them (the CyNinja repo's comments are a
catalogue of traps). The mitigations are the same discipline Sprite Studio
already has: measured audits as hard gates, review renders at every
checkpoint, and a human approval before anything is built.

**Recommended next step** if we proceed: port the audit gates, then run one
end-to-end authoring loop — an LLM writing a new character file from a text
brief inside Sero, with audits and strip screenshots as its feedback —
before any UI work. That is the only genuinely unproven link in the chain.

## Where things are

- Spike (branch `spike/sprite-studio-ink-and-bones`):
  `spikes/ink-and-bones/` — engine port, demo character, browser page.
- Reference implementation: `repos/cyninja-prompt-demo` — read
  `docs/ANIMATION.md` first; `puppets/cyninja.gd` is the worked example of
  a converged character file; `tools/puppet_audit.gd` is the audit set to
  port.
