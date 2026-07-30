# Design Library Gallery-page enhancements plan

**Status:** Complete
**Branch:** `fix/design-library-gallery-page`
**Scope:** Gallery navigation, search, version selection, and header
**Decision entry:** `docs/decisions/sero-design-library-gallery-page-enhancement-decisions.md`

## 1. Goal

Make Gallery controls consistent with the Library and shared Sero UI.

## 2. Changes

1. Replace the native version picker with the shared Select.
2. Put the selected version tick on the right through the shared Select item.
3. Add live counts to every Gallery scope.
4. Match the Gallery rail to the Library rail.
5. Match Gallery search to Library search.
6. Remove the header aggregate summary.
7. Update the product specification and user documentation.

## 3. Verification

1. Test version selection with the shared Select.
2. Test Gallery scope counts and search.
3. Run the Design Library plugin tests.
4. Run the Design Library plugin typecheck and build.
5. Run React Doctor.
6. Check every touched source file is below 500 lines.
7. Run root `pnpm typecheck` before commit.
