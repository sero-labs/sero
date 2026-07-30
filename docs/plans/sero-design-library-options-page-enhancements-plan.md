# Design Library options-page enhancements plan

**Status:** Complete
**Branch:** `fix/design-library-options-page`
**Scope:** Model choices, settings help text, and media-call control
**Decision entry:** `docs/decisions/sero-design-library-options-page-enhancement-decisions.md`

## 1. Goal

Make the Design Library options page simpler and safer to use.

## 2. Changes

1. Remove the marked help text from the model settings.
2. Add a provider-neutral media-model catalogue contract.
3. Read active model choices from the fal.ai Model Search API.
4. Replace media-model text fields with the shared searchable, grouped, single-choice Combobox.
5. Extract the Create Design count stepper.
6. Use the shared stepper for Media calls per run.
7. Add an accessible usage tooltip beside each media-model label.
8. Bound fal.ai discovery to one anonymous request and cache successful results.
9. Keep saved and manual endpoint choices available when discovery fails.
10. Show catalogue errors with Retry and remove the grouped-list display cap.
11. Give the shared stepper an accessible group and direct entry for media calls.
12. Update the product specification and user documentation.

## 3. Verification

1. Test the anonymous catalogue request, capability mapping, cache, refresh, and failure fallback.
2. Test media-model search, all provider groups, manual entry, Retry, fallback choices, and usage tooltips.
3. Test the media-call stepper boundaries, direct entry, accessibility, and settings action.
4. Run the Design Library plugin tests.
5. Run the Design Library plugin typecheck and build.
6. Run React Doctor.
7. Check every touched source file is below 500 lines.
8. Run root `pnpm typecheck` before commit.
