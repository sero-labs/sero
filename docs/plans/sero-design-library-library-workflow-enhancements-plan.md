# Design Library library-workflow enhancements plan

**Status:** Complete  
**Branch:** `feat/design-library-workflow-enhancements`  
**Scope:** Library inspector, generation flow, source picker, and filters  
**Authority:**

- `docs/specs/sero-design-library-plugin-spec.md`
- `docs/decisions/sero-design-library-first-release-decisions.md`
- `docs/prototypes/sero-design-library-plugin.html`
- `docs/plans/sero-design-library-plugin-implementation-plan.md`

This plan starts enhancement work after the first release. It does not reopen or amend the closed first-release plan.

## 1. Goal

Make generation and filtering clear when a Library has many references.

The work must:

1. Show the original generation prompt for generated references.
2. Separate fresh generation from work based on an existing reference.
3. Replace the current flat capability tabs with clear groups.
4. Make source and filter pickers usable with hundreds or thousands of values.
5. Give the generation prompt more writing space.
6. Rename the selected-reference action from **Restyle** to **Remix**.

## 2. Product decisions

The companion decision proposal is:

`docs/decisions/sero-design-library-library-workflow-enhancement-decisions.md`

The static review prototype is:

`docs/prototypes/sero-design-library-generation-workflow-enhancement.html`

No product implementation starts until this plan and prototype are approved.

## 3. User flows

### 3.1 Generate

The Library header **Generate** action starts without a source reference. The panel title is **Generate**.

It offers only:

- **Image** — text-to-image
- **Video** — text-to-video

It does not show Restyle or Upscale. It does not show a source picker.

### 3.2 Remix

When one reference is selected, the action bar shows **Remix** instead of **Restyle**.

The Remix panel starts with that reference selected. It has two groups:

- **Create new**
  - Image — image-to-image
  - Video — image-to-video
- **Edit this reference**
  - Restyle — image-to-image
  - Upscale — upscale

**Image** creates a new composition from the reference. **Restyle** changes its visual style. Both use image-to-image, create a derived item, and keep the source item unchanged.

Image-to-video is a new application capability backed by the configured fal.ai image-to-video model. It sends the selected reference as the source. It does not reuse text-to-video and does not discard the source.

The source picker stays available in Remix so the user can change the reference without closing the panel.

### 3.3 Generated-reference inspector

The inspector adds a final read-only section named **Original request** when generation provenance exists.

It shows:

- The original prompt, including an explicit “No prompt” value for an empty upscale prompt
- The operation label
- The model id

The section is last because it is supporting provenance. The Librarian’s editable **Generation prompt** remains separate. That field describes how to make future work in the same design language; it is not the prompt that created the current file.

### 3.4 Large source lists

Replace the source select with a searchable popover.

- The trigger shows the selected reference.
- Opening the picker focuses search.
- Search matches reference titles without case sensitivity.
- The list has a fixed maximum height.
- Typing narrows the list, so the user does not need to scan the full Library.
- The selected result has a right-side tick.
- Keyboard users can search, move through results, select, and close the picker.

This bound protects the renderer when a Library has thousands of references. It also removes the need to scroll through the complete Library.

### 3.5 Large filter lists

Each facet menu keeps its current multi-select behavior.

- Move ticks to the right.
- Use the shared searchable multi-select Combobox.
- Keep the menu at a fixed maximum height.
- Filter matching values as the user types.
- Keep the menu open while the user selects more than one value.

Short filter lists stay simple and do not show a search field.

## 4. Interface changes

### 4.1 Generation panel

- Use a two-column option grid instead of a flat tab row.
- Use section headings only when a source exists.
- Show the selected state with the same surface and border language as the inspector.
- Increase **Describe it** to six visible rows and set a useful minimum height.
- Keep aspect and duration controls below the prompt.
- Keep the spend note and final action in the footer.
- Change the final action label to match the selected operation where useful, such as **Generate video** or **Upscale**.

### 4.2 Wording

- Selection action: **Restyle** → **Remix**
- Panel title: **Generate**
- Source-led panel title: **Remix reference**
- Source field: **Work from**
- Provenance section: **Original request**
- Original prompt label: **Prompt**

## 5. Data and runtime changes

### 5.1 Original request

The item record already stores generation provenance. Extend the item-detail result with a read-only projection of that provenance. Do not duplicate it in state or the Librarian profile.

### 5.2 Image-to-video

Add `image-to-video` to the vendor-neutral media capability type and every exhaustive capability map.

Required changes include:

- Persisted settings normalization with a safe default for existing profiles
- fal.ai default model configuration
- Source resolution and upload
- fal.ai request mapping with `image_url`, prompt, duration, and supported aspect fields
- Video confirmation and duration limits
- Generated item kind, frames, analysis, provenance, and parent link
- Tool and UI labels
- Contract, coordinator, settings, and recovery tests

The model id remains editable in Settings. The user chooses a capability, not an endpoint.

## 6. Delivery sequence

### Phase 0 — Review gate

- [x] Create a fresh enhancement branch.
- [x] Create this separate plan.
- [x] Create a separate decision proposal.
- [x] Create a static panel prototype.
- [x] Receive approval before product implementation.

### Phase 1 — Provenance and scalable controls

- [x] Project original generation provenance into item details.
- [x] Add the final inspector section and tests.
- [x] Use the shared searchable Combobox for references.
- [x] Use the shared multi-select Combobox for facets and right-side ticks.
- [x] Add large-list tests for source and filter pickers.

### Phase 2 — Generation workflow

- [x] Add explicit `fresh` and `remix` dialog modes.
- [x] Replace the flat capability tabs with grouped option controls.
- [x] Hide source operations from fresh Generate.
- [x] Rename the selection action to Remix.
- [x] Increase the prompt area.
- [x] Add dialog behavior and accessibility tests.

### Phase 3 — fal.ai image-to-video

- [x] Add the vendor-neutral capability and settings migration.
- [x] Add fal.ai request and result mapping.
- [x] Route Remix → Video through the source-aware capability.
- [x] Confirm spend before every video request.
- [x] Add provider contract, runtime, and UI tests.

### Phase 4 — Documentation and verification

- [x] Update the product spec for approved behavior.
- [x] Update the docs site where Library generation is described.
- [x] Run focused plugin tests.
- [x] Run `npx react-doctor@latest --verbose --scope changed` after React changes.
- [x] Run root `pnpm typecheck` before each commit.
- [x] Check every touched source file is below 500 lines.
- [x] Run the plugin build and test suite.
- [x] Commit with a Conventional Commit message.

## 7. Acceptance checks

1. Fresh Generate has only Image and Video.
2. Remix opens with the selected reference and shows two clear operation groups.
3. Remix → Video sends the reference to an image-to-video fal.ai model.
4. No operation silently ignores a selected source.
5. The original prompt appears only when provenance exists and is last in the inspector.
6. The Librarian generation prompt remains editable and distinct from the original prompt.
7. A source among 5,000 references can be found by typing part of its title.
8. A filter facet with 5,000 values has a fixed-height searchable list.
9. Filter ticks appear on the right.
10. The prompt area is visibly larger than the first-release control.
11. Existing generated and imported records still normalize without data loss.
12. Video confirmation and duration limits apply to text-to-video and image-to-video.

## 8. Small workflow improvements included

These completed changes have low complexity and support the requested flow:

- Keep the last typed prompt when the user changes operation inside one open panel.
- Clear an invalid aspect or duration choice when the selected model does not support it.

The scope does not include video import, webpage capture, clipboard HTML, semantic search, plugin output, arbitrary npm dependencies, mixed output targets, pinning, or archiving.

## 9. Resolved review questions

1. Use **Create new** and **Edit this reference** as the group names.
2. **Image** creates a derived item from the selected reference.
3. Do not show two controls that send the same image-to-image request.
4. Shared `@sero-ai/ui` Combobox behavior supplies search, bounded height, multi-select and right-side ticks. Do not duplicate these controls in the plugin.
5. The Colour Combobox shows named colour families instead of raw colour codes.
