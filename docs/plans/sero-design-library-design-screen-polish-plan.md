# Design Library Design-screen polish plan

**Status:** Complete
**Branch:** `fix/design-library-design-screen`
**Scope:** Design inspector tabs, variant actions, Designs rail, Tweaks prompt, and revision guidance
**Decision entry:** `docs/decisions/sero-design-library-design-screen-polish-decisions.md`

## 1. Goal

Make the Design screen clearer and make generated style controls more useful.

## 2. Changes

1. Use the shared line-tab style in the variant inspector.
2. Show variant retry only when the current generation can be retried.
3. Remove the new-Design plus action from the Designs rail.
4. Ask the generation model for a broader set of relevant style controls.
5. Clarify the difference between **Replace it** and **Keep both**.
6. Update the product specification and user documentation.

## 3. Verification

1. Add a prompt contract test for the expanded style-control guidance.
2. Run the Design Library plugin tests.
3. Run the Design Library plugin typecheck and build.
4. Run React Doctor.
5. Check every touched source file is below 500 lines.
6. Run root `pnpm typecheck` before commit.
