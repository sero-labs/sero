# Design Library

> Status: **built-in plugin**. Ships with Sero and is available in every profile.

## Overview

Design Library is your private visual memory. You collect screenshots and images you like, Sero reads each one and describes its design language, and later you turn that language into original work.

You collect references in the **Library**, turn them into runnable work in **Design**, and keep the results in the **Gallery**. The Gallery, and generating imagery, arrive in the next release.

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

## Designing from your references

Select the references you want, then choose **Create design**. Order matters: the first one you pick leads the visual direction and the rest contribute traits that fit alongside it. You can use up to six.

The dialog is one decision:

| Choice | What it does |
| --- | --- |
| Request | What you want built, in your words |
| Prompt recipe | A named instruction template applied on top of the request |
| Output target | Self-contained HTML, or React with Tailwind |
| Variation mode | Blend all the references, or one variant per reference |
| Variants | 1–5 directions, generated independently |
| Inspiration strength | How closely the result follows the references rather than the request |

Under the brief, **Applied guardrails** lists every rule the run will be held to — the Always and Never rules the Librarian wrote for your references, combined. Only rules in force are shown.

**Session rule** adds one of your own for this design alone. It carries the same weight as the references' rules and is recorded on the design as yours, so a rule you asked for on the day is never mistaken for something the Librarian read in a reference. Adding a rule the references already state changes nothing.

The panel beside it names the references in order and says whether the synthesis is ready or blocked.

### When references disagree

If one reference requires something another forbids, that rule is held back and you are asked which side to keep. Nothing generates until you decide, because a brief that contradicts itself would just have the model pick a side quietly. Only genuine contradictions block; different styles blend without a question.

What you choose is recorded on the design, so *"why is this design ignoring that rule?"* stays answerable later. Editing a reference afterwards does not change a design that was already generated under the old rules.

A reference has to be analysed before you can design from it. The design run is given the Librarian's written description and never the image itself, so a reference with no description has nothing to contribute.

### Watching it generate

Each variant is its own piece of work. They run a couple at a time and appear as they finish.

- Each one names itself — "Signal ledger", "Glass telemetry" — so the tabs say what the directions were rather than counting them.
- One failing changes nothing about the others — you keep whatever worked.
- **Try again** re-runs a single variant. Its earlier attempt stays in its history.
- **Stop** cancels one variant and leaves its siblings running.
- Closing the app does not stop generation, and work resumes if Sero restarts mid-run.

### The preview

Generated work runs in a sealed frame: no network, no access to Sero, your files or your workspace, no cookies or storage, and nothing outside what the plugin bundles. Everything it needs is inside the one file it runs from.

If the design tried to do something the frame does not allow — load a font from the web, call an API, open a new window — the preview blocks it, still shows everything else, and lists what it stopped underneath the frame. A warning always means the thing was blocked. It never means it was allowed.

Because there is no network, generated designs use the system fonts, CSS gradients and shapes, and SVG they draw themselves.

There is one thing a page can do that no guard can stop in advance: send itself to another address, the way following a link would. The preview notices, empties the frame straight away and says so — but by then that one request has gone out, and a page can write whatever it holds into the address it asks for. What it holds is only itself: the frame never had your files, your storage or anything of Sero's to put there.

Underneath the preview you can set the width the page is rendered at, and reload it. **Pane width** lets the page reflow as the pane changes, the way a browser window does; **desktop**, **tablet** and **phone** pin it to a fixed width so you can see how it holds up there. A fixed width wider than the pane is scaled down to fit, and the readout always shows the width being used and the scale it is shown at. The last control hides the panel beside the preview so the page has the whole surface, and brings it back.

### The panel beside the preview

Four tabs, all about the variant on screen:

- **Design** — what the run made and what it was made from: its concept, the references it drew on, and the visual language it took from them.
- **Files** — what it wrote, and how big each file is.
- **History** — every result this variant has had, and the tweak values you had set earlier. Selecting one puts it back on screen; nothing is generated and nothing is lost.
- **Tweaks** — the live controls for this exact page (below).

Drag the panel's left edge to widen it, and the width is remembered. The Designs rail on the far left collapses to initials, which is what makes a wide panel affordable on a laptop.

### Designs you have on the go

The rail down the left lists your designs, with the ones still generating at the top and how far along they are. Generation keeps running whether or not you are looking at it, so moving between designs costs nothing, and reopening one puts you back on the variant you were last looking at.

### Tweaks

Every result comes with a small set of controls written for **that page** — display scale, grid gap, signal accent, whatever the page is actually about. They are not a standard set of sliders: the model that wrote the page chooses them from what it built, so a dense dashboard and an editorial page get different controls.

Moving one changes the preview immediately. Each control has a reset, the panel has **Reset all**, and **Copy CSS** gives you the values as a block you can paste into the page's own stylesheet.

Values save as you go and survive a restart. Everything you change in one sitting is kept as a single entry under **History → Earlier tweak values**, so a long session of adjusting is one thing to go back to rather than fifty — and **Reset all** is undoable for the same reason.

A control that would not visibly change anything is dropped before you see it — a page that never uses the value it was meant to set. When that happens the panel says how many were left out, and expands to say why.

### Asking for changes

The box under the preview asks for a change to the variant on screen: *"make the metrics tighter"*, *"try a lighter surface"*. The run is given the page it is editing, so it changes what you asked about and leaves the rest alone.

Beside the box you choose what happens to the result you already have:

| Choice | What happens |
| --- | --- |
| Replace it | The new result takes its place. The old one stays in History and can be brought back |
| Keep both | Both stay in the revision list, and you switch between them |

Your choice is remembered as the default, and can also be changed in Settings. Nothing is ever deleted by revising — revisions stay until you delete one yourself.

## Deleting

**Delete** moves a reference to Trash, where it stays until you restore it or delete it permanently. Permanent deletion removes the image and its analysis, and leaves behind only a record of what used to be there, so anything that referred to it can still explain what is missing. Deleting a collection never deletes the references inside it.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Librarian model | Sero's configured model | The model that reads references and writes their design language |
| Design model | Sero's configured model | The model that generates and revises work |
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
| `design_library_designs` | List and read designs, preview the combined guardrails, start a design from named references, retry, stop or revise a variant, switch or delete revisions, and set tweak values |

Ask things like *"what dark, data-dense references do I have?"*, *"reanalyse the Northstar screenshot"*, *"make a dashboard from the Northstar and Material journal references"*, or *"revise variant 2 to use a lighter surface"*.

## Where things are stored

Everything lives in the active profile's Sero home under `apps/design-library/`: the original images, their previews, the analysis records, every generated design and the search index. Nothing leaves your machine except the image sent to your configured model for analysis, and the written description sent when you generate.

Deleting a profile deletes its library. There is no cloud copy.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [Models and Providers](/guide/models-and-providers)
- [Security / Privacy](/reference/security-privacy)
