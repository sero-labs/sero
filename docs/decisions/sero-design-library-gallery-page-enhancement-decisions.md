# Design Library Gallery-page enhancement decisions

**Status:** Accepted
**Date:** 2026-07-30
**Scope:** Gallery navigation, search, version selection, and header

This is a separate decision entry for Gallery-page enhancement work. It does not reopen the first-release decisions.

## E1 · Version selection uses the shared Select

Gallery cards use `Select` from `@sero-ai/ui` for version selection.

**Reason.** The current control is a native HTML select with local styling. It does not match other Sero controls.

**Consequence.** The shared `SelectItem` places the selected tick on the right. Gallery does not add local menu styling.

## E2 · Gallery navigation matches Library navigation

The Gallery rail uses the same row, heading, active, icon, and count styles as the Library rail.

Each scope shows a live count:

- **All designs** — live families
- **Favourites** — favourite live families
- **Recently saved** — live families updated in the last seven days
- **Trash** — the entries shown in Gallery Trash

**Reason.** The two rails perform the same kind of navigation. Different styles make the product feel inconsistent, and hidden counts make scope changes harder to predict.

**Consequence.** Shared local navigation components keep both rails aligned. Counts derive from current Gallery state and update when that state changes.

## E3 · Gallery search matches Library search

Gallery uses the shared `SearchInput` in the same compact toolbar layout as Library. The toolbar sits in the content column beside the rail and above the Gallery cards.

**Reason.** A full input inside a separate padded panel gives one simple search action too much visual weight.

**Consequence.** Search keeps the same filtering behaviour and gains the Library search icon, size, spacing, and placement. It does not span above the navigation rail.

## E4 · Gallery has no introduction header

Remove the full “Your Gallery” introduction block, including its description and aggregate summary. Search is the first row of the Gallery page.

**Reason.** The main navigation already names the Gallery. The introduction repeats that name and takes space without supporting an action. The rail counts provide useful totals where people act on them.

## E5 · Open Design is an icon action

Gallery cards use an open icon instead of an **Open Design** text button. The button keeps **Open Design** as its accessible name and tooltip.

**Reason.** The text action takes space from the version selector and repeats a standard navigation symbol.
