# Design Library

> Status: **built-in plugin**. Ships with Sero and is available in every profile.

## Overview

The Design Library is a private workspace for collecting visual inspiration and turning it into original, runnable work. It has three connected surfaces:

- **Library** — the images you collect, each analysed for its design language.
- **Design** — where you generate, preview, tune and revise new work.
- **Gallery** — the results you deliberately saved, kept exactly as they were.

The plugin captures how a reference *feels* — its rhythm, typography, geometry, colour behaviour and mood. It never copies a reference's logos, copy, imagery or composition, and reference pixels never reach generated output.

## Getting started

1. Open **Design Library** from the sidebar.
2. Add an image: click **Add inspiration**, drag a file onto the grid, or paste one from the clipboard.
3. Wait a moment — the Librarian analyses each image automatically and fills in its style, tags and guardrails.
4. Select up to six images. The first one you pick leads the visual direction.
5. Click **Create Design**, then **Generate**.

## Library

Every imported image becomes a card in a uniform grid showing its title, style, tags and analysis status.

- **Search** covers titles, tags, notes and the analysis text.
- **Filters** cover tag, colour, source, analysis status and date.
- **Importing the same image twice** opens the one you already have instead of creating a duplicate.

Opening a card shows the inspector. Every field the Librarian produced is editable, an edit overrides that whole field, and each edited field gets its own **Reset**. Re-running analysis refreshes everything you have not edited and leaves your edits alone.

Deleting an image hides it and keeps it recoverable. **Delete permanently** removes the original, but Designs and Gallery versions that used it stay intact — they keep a record of where the reference came from.

## Design

Each Design produces one to five variants (three by default), each an independent piece of work. If one fails you can retry just that one; the others are unaffected. Work continues while the plugin is closed, and resumes after a restart.

Choose one output target per Design:

- **HTML, CSS and JavaScript** — a self-contained page.
- **React, TypeScript and Tailwind** — compiled locally, using an approved set of bundled packages.

Previews run in an isolated frame with no network access and no access to Sero, your files or your settings. If generated code tries to do something restricted, the preview blocks it, keeps rendering the rest of the page and tells you what was blocked.

If two references disagree in a way that cannot be blended — one says "always", the other says "never" — generation stops and asks you to choose.

## Tweaks

Every generated variant comes with its own **Tweaks** panel. The model chooses the controls from the page it just built, so a typographic layout offers different controls from a dense dashboard. There is no fixed list.

- Changes apply to the preview immediately.
- Each control has its own **Reset**, and the panel has **Reset all**.
- **Copy CSS** copies the exact styles your changes produce.
- Your changes save continuously. A whole editing session becomes one point you can return to, so dragging a slider does not fill your history with noise.
- Controls that would not actually change anything are removed, and the panel says how many and why.

Tweaks can only change values the design itself declared. They cannot inject styles or code into the preview.

## Gallery

**Save to Gallery** stores an exact, permanent copy of a variant: its code, the tweak values in effect, its images and where it came from. Saving again adds a version to the same card rather than creating a new one; older versions stay available through the version picker, and one version is featured on the card.

- **Remix** and **Duplicate** start a new, linked card on purpose.
- Reopening a version restores the Design exactly as it was; the saved version itself never changes.
- Deleting is recoverable until you delete permanently, and never cascades to anything else.

**Export** writes the saved version to your Downloads folder or the active workspace: the source files, the images, a page with your tweak values already applied, and a small metadata file. The exported page works on its own — it does not need Sero.

## Generated artwork

When a design needs illustrative artwork, the model can generate it. Images are downloaded and stored locally, so previews and exports never depend on a remote URL, and each one records the provider, model, prompt and cost where available.

Artwork generation uses fal.ai. Add a `fal` credential to your profile (or set `FAL_KEY`) to enable it. Without a credential the design still works — it uses a local placeholder and offers **Retry artwork**. Interface icons never use artwork generation.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Variants per run | 3 | Any number from 1 to 5 |
| Revision result | Replace the visible result | Or retain both; either way nothing is lost |

Analysis and generation use the models you have already configured in Sero.

## Not in this release

Video, web page and clipboard HTML capture, collections, smart groups, pinning, archiving and semantic search are planned for later releases.
