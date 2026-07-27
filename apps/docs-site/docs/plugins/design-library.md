# Design Library

> Status: **built-in plugin**. Ships with Sero and is available in every profile.

## Overview

Design Library is your private visual memory. You collect screenshots and images you like, Sero reads each one and describes its design language, and later you turn that language into original work.

This first release covers the Library itself: getting references in, understanding them, and organising them. Designing from them and keeping the results arrive in the next two releases.

## Getting started

1. Open **Design Library** from the sidebar.
2. Add an image — drag it onto the window, paste it from the clipboard, or use **Add inspiration**.
3. The card appears straight away. Analysis runs behind it.
4. Click the edit button on the card to open it, read what the Librarian found, and edit anything you disagree with.

Clicking a card selects it, which is how you gather references. The edit button in its top corner opens it.

## Adding references

Three ways in, all identical once the image lands:

- **Drag and drop** anywhere in the Library.
- **Paste** from the clipboard.
- **Add inspiration** opens a file picker; select as many images as you like.

If you add an image you already have, Design Library opens the one you already have rather than making a second copy.

## What the Librarian reads

Analysis starts on its own after every import. It describes *feel* rather than content — rhythm, density, contrast, typography, geometry, material and mood — and deliberately does not record logos, brand names, copy or anything specific enough to be recognisable. That is what makes a reference safe to generate from later.

For each reference you get a title, a primary style, design types, tags, a one-line summary, the design intent, an aesthetic vocabulary, a palette, eight groups of visual observations, Always/Never guardrails, and a generation prompt.

## Editing analysis

Every field the Librarian writes is yours to change.

- **Edit** replaces that one field.
- **Reset** puts the Librarian's own value back.
- **Reanalyse** refreshes everything you have *not* edited, and leaves everything you have edited alone.

A field you edited is marked **Edited**. Blanking a field counts as an edit, so a field you deliberately emptied stays empty through a reanalysis.

## Finding things

- **Search** covers titles, tags, notes and every part of the analysis you can see.
- **Filters** narrow by media, style, tag, colour and source. Values inside one filter widen the results; different filters narrow them.
- **Favourites** and **Collections** are yours to arrange. A collection is a plain group you name.
- **Style groups** appear on their own once two references share a primary style. They are simply what the Librarian already said, counted — nothing extra runs to produce them.

## Deleting

**Delete** moves a reference to Trash, where it stays until you restore it or delete it permanently. Permanent deletion removes the image and its analysis, and leaves behind only a record of what used to be there, so anything that referred to it can still explain what is missing. Deleting a collection never deletes the references inside it.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Librarian model | Sero's configured model | The model that reads references and writes their design language |
| Design model | Sero's configured model | The model that generates and revises work (used from the next release) |
| Variants per design | 3 | How many directions a new design starts with |
| On revise | Replace what is visible | Or keep each revision separately |
| Prompt recipes | Three built in | Named instruction templates applied on top of a request |

Leaving a model empty means "use whatever Sero is configured to use".

## What the agent can do

Design Library exposes its read surface to the main Sero agent, so you can work from any chat.

| Tool | What it does |
| --- | --- |
| `design_library_items` | Search references, read one in full, edit or reset analysis fields, favourite, collect, delete and restore |
| `design_library_analysis` | Check analysis status, reanalyse, cancel or retry |

Ask things like *"what dark, data-dense references do I have?"* or *"reanalyse the Northstar screenshot"*.

## Where things are stored

Everything lives in the active profile's Sero home under `apps/design-library/`: the original images, their previews, the analysis records and the search index. Nothing leaves your machine except the image sent to your configured model for analysis.

Deleting a profile deletes its library. There is no cloud copy.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [Models and Providers](/guide/models-and-providers)
- [Security / Privacy](/reference/security-privacy)
