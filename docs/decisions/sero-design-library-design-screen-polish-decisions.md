# Design Library Design-screen polish decisions

**Status:** Accepted
**Date:** 2026-07-30
**Scope:** Design inspector, Designs rail, and generated Tweaks

This is a separate decision entry for a small Design-screen enhancement. It does not reopen the first-release decisions.

## E1 · Inspector tabs use shared line tabs

The Design, Files, History, Tweaks, and Art tabs use `TabsList variant="line"` from `@sero-ai/ui`. The active label and line use the theme primary colour.

**Reason.** The filled tab list has uneven visual padding in this panel. The shared line style already solves this in the generation panel.

**Consequence.** The inspector does not add a local tab style.

## E2 · Variant retry appears only after failure

The inspector shows **Try again** only when a variant has failed or was cancelled. It shows **Stop generating** while work runs. A ready variant has no header action.

**Reason.** A disabled retry action on every ready result looks like a second preview refresh. Preview reload remains in the preview toolbar.

**Consequence.** Failure recovery stays available without permanent inactive chrome.

## E3 · The Designs rail does not start new work

Remove the plus action from both widths of the Designs rail.

**Reason.** New Design work starts by choosing references in the Library. The Design header already has a clear Library action.

**Consequence.** The rail only lists and switches current Designs.

## E4 · Generated pages expose a useful style range

The generation prompt asks for four to eight page-specific controls after the fixed typography baseline. The controls cover at least three relevant style areas: colour, composition, spacing, shape, and atmosphere.

Controls must still bind to CSS custom properties that the page reads. The model must not add a control only to meet the count.

**Reason.** A request for only a small set of high-value controls often produces too little control over the page's visual system.

**Consequence.** Tweaks remain AI-authored and page-specific. The runtime validator and safe preview channel do not change.

## E5 · Revision choices describe status, not deletion

**Replace it** marks the current revision as replaced when the new revision succeeds. **Keep both** leaves the current revision as an equal alternative. Both choices open the new result and keep the old files in History.

**Reason.** Both choices preserve history. The difference is whether History marks the old revision as replaced.

**Consequence.** The existing labels stay, and user documentation states the exact difference.
