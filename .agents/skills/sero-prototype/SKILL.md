---
name: sero-prototype
description: |
  Create and review interactive Sero UX prototypes in the styleguide. Use when
  the user asks for a prototype, mockup, interaction concept, design
  exploration, UX review with a reviewable artifact, or a proposed Sero UI
  before production implementation. Trigger for work in
  `apps/styleguide/public/prototypes/` and for requests that say "prototype
  before implementing", "show me first", or "make this match Sero".
---

# Creating Sero prototypes

Build a reviewable design artifact that matches the current Sero desktop UI.
Do not treat a prototype as production implementation.

## Non-negotiable rules

- Store every deliverable under `apps/styleguide/public/prototypes/`.
- Link every interactive prototype from
  `apps/styleguide/src/PrototypeArchive.tsx`.
- Never deliver a prototype from `/tmp`, a clipboard path, or another protected
  directory.
- Inspect the closest existing prototype before creating a new one. Reuse its
  useful structure and interaction patterns, but verify them against the current
  product source because archived prototypes can be outdated.
- Do not edit production UI while the user is still reviewing the prototype.
- Show only controls and behavior supported by the proposed design. Do not add
  decorative controls that imply unsupported functionality.
- Use ASD-STE100 Simplified Technical English for labels and explanatory copy.

## Workflow

### 1. Define the review question

State what the prototype must help the user decide. Extract these items from
the request and screenshots:

- target workflow and entry point
- behavior that must match an existing Sero surface
- supported and unsupported actions
- key states the user must compare
- unresolved product choices

Ask focused questions before building only when different answers would change
the interaction model. If the user asked to discuss before implementation, stop
after the prototype and review notes.

### 2. Inspect Sero before drawing

Read the smallest relevant set of sources:

1. The current production components for the feature and the Sero surface it
   must match.
2. `packages/ui/src/styles/globals.css` for current tokens, typography, focus,
   radii, and status colors.
3. Related shared components under `packages/ui/src/components/`.
4. The closest prototype in `apps/styleguide/public/prototypes/`.
5. `apps/styleguide/src/PrototypeArchive.tsx` to understand current names and
   avoid duplicate entries.

For changes to an existing concept, inspect its saved prototype first. Create a
new descriptive prototype file unless the user explicitly asks to replace the
historical artifact.

### 3. Choose the artifact

Use an interactive standalone HTML prototype by default. Name it with a short,
lowercase kebab-case slug:

```text
apps/styleguide/public/prototypes/<concept>.html
```

Use `prototypes/<concept>/index.html` with adjacent CSS, JavaScript, or image
assets when a single HTML file would become hard to review or exceed the
repository file-size rules. Do not depend on a CDN or remote runtime. The
prototype must work through the styleguide Vite server without network access.

Use static images only when interaction adds no review value. Put persistent
review captures in:

```text
apps/styleguide/public/prototypes/screenshots/<concept>/
```

### 4. Match the product

- Copy semantic token names and current values from the Sero design system.
  Do not invent a second palette.
- Match the current desktop layout, density, spacing, border treatment,
  typography, active states, and control placement.
- Use standard Sero font sizes. In React or Tailwind prototypes, use utilities
  such as `text-xs`, `text-sm`, and `text-base` instead of arbitrary sizes.
- Use inline Lucide SVG geometry or repository-owned assets. Do not substitute
  emoji or unrelated Unicode glyphs for product icons.
- Use realistic, sanitized Sero data. Keep names and copy short.
- Preserve the hierarchy and interaction language of the product surface being
  matched. A different runtime or backend must not create a different visual
  system without a product reason.
- Use clear focus, hover, selected, disabled, loading, streaming, success, and
  error states where they affect the proposed workflow.
- Respect `prefers-reduced-motion`. Avoid animation that does not explain a
  state change.

If the prototype explores alternatives, label each option and keep the data and
viewport consistent so the user can compare the design rather than the content.

### 5. Make the important behavior real

Implement the interactions needed for review, not every product feature. Common
examples include:

- opening and closing menus, popovers, and dialogs
- search and filtering
- keyboard focus, Enter, arrow keys when applicable, and Escape
- adding, selecting, renaming, or deleting prototype rows
- changing empty, loading, connected, disconnected, or streaming states
- preserving user overrides such as expansion and scroll position

Use semantic HTML. Every icon-only button needs an accessible name. Every field
needs a label or accessible name. Keep the DOM state and visible state in sync.

### 6. Add the archive entry

Add a concise label and prototype path to `interactivePrototypes` in
`apps/styleguide/src/PrototypeArchive.tsx`. Keep the label specific enough to
distinguish revisions of the same feature.

The archive is a design history. Do not describe a prototype as current product
behavior or overwrite an older concept without an explicit reason.

### 7. Serve and review it

Run the styleguide from the repository root:

```bash
pnpm styleguide
```

Open the prototype through the server, never through a `file://` URL:

```text
http://127.0.0.1:5176/prototypes/<concept>.html
```

Use the `agent-browser` skill when browser automation is available. Check:

1. The archive link opens the prototype.
2. Every review interaction works from the served URL.
3. Keyboard focus order and Escape behavior are correct.
4. The design works at the user's screenshot size and at a smaller desktop
   viewport.
5. Popovers and menus stay within the viewport.
6. Text does not clip at normal desktop zoom.
7. An accessibility audit has no automatic violations. Manually inspect any
   incomplete contrast results.

Capture the default state and each decision-critical state when screenshots
make review easier. Keep those captures in the repository if they are part of
the requested deliverable.

### 8. Validate

Keep validation proportional to the artifact. For a standalone HTML prototype
plus its archive link, use the served browser review, the targeted styleguide
build when its dependencies are already available, and `git diff --check`. Do
not install the full monorepo, run repository-wide checks, or rebuild unrelated
packages only to validate a design artifact. If a requested commit has a wider
repository gate that would require substantial environment setup, pause and
tell the user before expanding the work.

Run:

```bash
pnpm --filter @sero/styleguide build
git diff --check
```

Run root `pnpm typecheck` before a commit, as required by `AGENTS.md`.

Do not run React Doctor for a standalone HTML prototype. Run it when the
prototype changes React code beyond the archive entry.

## Quality gate

Do not call the prototype ready until all answers are yes:

- Does it answer the user's review question?
- Does it look like the current Sero surface it must match?
- Did you inspect and learn from the closest existing prototype?
- Are unsupported controls absent?
- Are the important interactions functional with mouse and keyboard?
- Are default, empty, busy, failure, and confirmation states represented when
  relevant?
- Is it reachable from the styleguide archive?
- Did you test the served URL at two desktop viewport sizes?
- Did build, diff, and accessibility checks pass?

## Delivery

Report:

- the repository path
- the styleguide route
- the states and interactions included
- the source examples used for consistency
- validation results
- any product decision still needed

Do not provide a temporary path as the primary deliverable. Do not implement the
production feature until the user approves the direction.
