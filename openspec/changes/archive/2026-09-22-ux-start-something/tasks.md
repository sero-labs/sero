## 1. Previews that render the real components

- [x] 1.1 Add `room-brief`, `room-planning`, `room-proposal` and `catalog` entries to `ui/__preview__/previews.tsx`, each rendering the real component at the drawing's panel width, with fixtures beside them. Verify each appears at `ui/__preview__/index.html?preview=<id>` and that the `@container/panel` root is present.
- [x] 1.2 Add a `plan-map-skeleton` preview for `PlanMapSkeleton`. Verify it renders.
- [x] 1.3 Build the `room-proposal` fixture from the drawing's Frogger proposal: three named roles, a recorded `planningUsage` of $0.11, and read-only access. Verify the preview shows all four.
- [x] 1.4 Build the `catalog` fixture with an official entry without steps, an added-repo entry with `modelTier` MED, and an entry with seven steps. Verify all three render and Details opens.
- [x] 1.5 Check the Orchestrator preview page still carries its `@container/panel` root before trusting any capture. Verify by reading `ui/__preview__/main.tsx`.

## 2. The Room brief (frame 1)

- [x] 2.1 Replace the claim in `RoomBriefForm.tsx` with "The team starts only when you press Start room." Verify no user-visible string on the screen says nothing has been spent.
- [x] 2.2 Bring the frame to the drawing using existing token utilities: the 720px column, the headline, the textarea's height/padding/radius, the chip heights and radii, the footer spacing and the button heights. Verify against a capture beside the drawing.
- [x] 2.3 Verify the footer line renders on one line at the drawn column width, and that the preset cards still render below the fold.

## 3. The planner wait (frames 2 and the Workflow skeleton)

- [x] 3.1 Replace `RoomPreparing`'s step list, progress bar and countdown with a spinner and the real elapsed time. Remove the descriptive paragraph. Verify no step, bar or countdown renders, and that the spinner keeps a `prefers-reduced-motion` guard.
- [x] 3.2 Replace `PlanMapSkeleton`'s pulse and four placeholder boxes with the same spinner and elapsed time. Verify no pulsing placeholder renders.
- [x] 3.3 Set the titles: "Designing your team" for the create wait, "Rethinking your team" for the adjust wait, and "Planning this Workflow" for the Workflow wait. Verify each call site passes its own title.
- [x] 3.4 Verify elapsed time starts at the request and keeps counting, and that a long wait does not switch to an invented estimate.

## 4. The Room proposal (frame 3)

- [x] 4.1 Pass `room.runtime.planningUsage` from `RoomDraftReview` to `RoomProposal` and show `Designing this team cost $0.11` beside Start room. Verify it shows on the plain and the recomputed proposal, and is absent when the record holds no usage.
- [x] 4.2 Drop the approval band's `computed from the plan the team will run under` hint and the four subtitles (`1 leads, 2 work`, `then it pauses for you`, `hard stop`, the access mode line). Verify no subtitle renders under any figure.
- [x] 4.3 Fold read-only access into one value reading `Read this workspace`, composed at the proposal call site so `RoomAdvancedSettings` is unchanged. Verify the advanced settings' access tile is unchanged.
- [x] 4.4 Widen the member-name column to the drawing's width and remove the truncation, keeping the avatar and the lead mark. Verify the Frogger names render in full.
- [x] 4.5 Bring the frame's sizes, radii and spacing to the token ladder. Verify no fixed px font size or radius remains in `RoomProposal.tsx`.

## 5. The Workflow Review step

- [x] 5.1 Show `Planning this cost <amount>` from `loop.planningUsage` beside Save as draft and Activate workflow in `CreateLoopWizard.tsx`, using the same treatment as the Room proposal. Verify the line is absent when the record holds no usage.
- [x] 5.2 Verify the figure is the loop's full planning usage, including spend from the Clarify step, and that it agrees with the figure enforced against the cost limit.

## 6. The Catalog (frame 4)

- [x] 6.1 Make the repository bar one row: override the shared `Card`'s column direction, and match the drawing's chip shape and the drawn `+` and `↻` text controls in place of the lucide icons. Verify the bar renders as one row in a capture.
- [x] 6.2 Make the model-tier chip read `low-tier model`, `mid-tier model` or `high-tier model` from the entry's tier, in `ui/lib/catalog-summary.ts`. Verify with a unit test covering all three tiers and an entry with no tier.
- [x] 6.3 List the entry's numbered step titles from `definition.plan.steps` inside Details, and include steps in the condition that shows Details at all. Verify an entry whose plan has steps opens Details and shows them in order, and that its limitations, required tools and example output remain.
- [x] 6.4 Bring the entry card and the repo bar to the token ladder and to the drawn glyphs: the title, description and chip sizes, the card radius, the `✓` verified mark in place of `BadgeCheck`, the text-only Install in place of the `Download` icon, and the drawn triangle in place of the chevron. Verify against a capture beside the drawing.

## 7. Token discipline and checks

- [x] 7.1 Confirm no fixed px font size, radius or arbitrary spacing remains in the touched files: `RoomBriefForm.tsx`, `RoomPlanning.tsx`, `PlanMap.tsx`, `RoomDraftReview.tsx`, `RoomProposal.tsx`, `CreateLoopWizard.tsx`, `CatalogBrowser.tsx`, `CatalogEntryCard.tsx`. Verify with a grep and record any deliberate exception in `design.md`.
- [x] 7.2 Confirm the four surfaces use `font-mono text-xs` rather than `room-mono-micro`, and record in `design.md` that `room-mono-micro`'s fixed 9px remains on other surfaces.
- [x] 7.3 Run `pnpm typecheck` from the monorepo root and the Orchestrator plugin's tests. Verify both pass with no error.
- [x] 7.4 Verify no runtime, record, store or IPC file changed, and that `orchestrator-run-accounting`'s recorded figures are untouched.

## 8. Captures and the comparison record

- [x] 8.1 Capture each of the drawing's four frames and each built surface at the same panel width, at a viewport wider than the panel, opening every fold and chevron on both sides first. Verify the images exist and that no capture is clipped at its right edge.
- [x] 8.2 Read each drawing frame beside its build capture and write `comparison.md`: the deltas the captures found, what was done, and an explicit list of what was never compared (the Workflow Review and the planning skeleton have no drawing; the app top bar is out of scope). Verify every frame is either compared or listed as not compared.
- [x] 8.3 Verify the departure list is complete: the dropped 9px tier, the sub-pixel differences the token ladder cannot reproduce, and any element the drawing drops whose only reachable home was checked first.
