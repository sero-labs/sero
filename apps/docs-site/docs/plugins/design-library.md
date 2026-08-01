# Design Library

> Status: **built-in plugin**. Ships with Sero and is available in every profile.

## Overview

Design Library is your private visual memory. You collect screenshots and images you like, Sero reads each one and describes its design language, and later you turn that language into original work.

You collect references in the **Library**, turn them into runnable work in **Design**, and keep the results in the **Gallery**. Designs can generate their own artwork and video, and you can generate references straight into the Library. **Sprite Studio** turns a character into finished 2D sprite sheets.

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
- **Filters** narrow by media, style, tag, colour and source. The colour filter uses families such as Reds, Greens, Blues and Neutrals. Values inside one filter widen the results; different filters narrow them.
- **Favourites** and **Collections** are yours to arrange. A collection is a plain group you name.
- Select references and open **Collections** to add or remove them. Use the action menu beside a custom collection to delete the collection; its references stay in the Library.
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

A reference has to be analysed before you can design from it. For an image you imported, the design run receives the Librarian's written description and never the image itself.

An image made by Design Library can also be used as the actual artwork. When you start a design from a generated or restyled image, the Design gets its own copy and can use it across variants. Removing the Library item later does not break the Design.

### Watching it generate

Each variant is its own piece of work. They run a couple at a time and appear as they finish.

- Each one names itself — "Signal ledger", "Glass telemetry" — so the tabs say what the directions were rather than counting them.
- One failing changes nothing about the others — you keep whatever worked.
- **Try again** re-runs a single variant. Its earlier attempt stays in its history.
- **Stop** cancels one variant and leaves its siblings running.
- Closing the app does not stop generation, and work resumes if Sero restarts mid-run.

### The preview

Generated work runs in a sealed frame: no network, no access to Sero, your files or your workspace, and no cookies or storage. Design fonts are bundled with the plugin and passed into the frame as local data.

If the design tried to do something the frame does not allow — load a font from the web, call an API, open a new window — the preview blocks it, still shows everything else, and lists what it stopped underneath the frame. A warning always means the thing was blocked. It never means it was allowed.

Generated designs can use the Design font picker, system fonts, CSS gradients and shapes, and SVG they draw themselves. Generated code cannot request remote fonts or assets.

There is one thing a page can do that no guard can stop in advance: send itself to another address, the way following a link would. The preview notices, empties the frame straight away and says so — but by then that one request has gone out, and a page can write whatever it holds into the address it asks for. What it holds is only itself: the frame never had your files, your storage or anything of Sero's to put there.

Underneath the preview you can set the width the page is rendered at, and reload it. **Pane width** lets the page reflow as the pane changes, the way a browser window does; **desktop**, **tablet** and **phone** pin it to a fixed width so you can see how it holds up there. A fixed width wider than the pane is scaled down to fit, and the readout always shows the width being used and the scale it is shown at. The last control hides the panel beside the preview so the page has the whole surface, and brings it back.

### The panel beside the preview

Five tabs, all about the variant on screen:

- **Design** — what the run made and what it was made from: its concept, the references it drew on, and the visual language it took from them.
- **Files** — what it wrote and how big each file is. **Show in folder** opens that revision in your file manager.
- **History** — every result this variant has had, and the tweak values you had set earlier. Selecting one puts it back on screen; nothing is generated and nothing is lost.
- **Tweaks** — the live controls for this exact page (below).
- **Art** — the pictures and video this design uses (below).

Drag the panel's left edge to widen it, and the width is remembered. When the panel is narrow the tab labels become icons; hover one to see its name. The Designs rail on the far left collapses to initials, which is what makes a wide panel affordable on a laptop.

### Designs you have on the go

The rail down the left lists your designs, with the ones still generating at the top and how far along they are. Generation keeps running whether or not you are looking at it, so moving between designs costs nothing, and reopening one puts you back on the variant you were last looking at.

### Tweaks

Every result starts with the same typography controls: Font, H1 size, H1 weight, H1 tracking, H2 size, Body font and Body size. Font controls show the standard Design font catalog. Body size drives common copy, controls, tables, labels and utility text through a small shared type scale.

Revisions made before this typography contract keep their original controls. Revise or regenerate them to get the font catalog and shared type scale.

After those, the result has four to eight controls written for **that page**. They cover relevant colour, composition, spacing, shape, and atmosphere choices. A dense dashboard and an editorial page still get different page controls.

Moving one changes the preview immediately. Each control has a reset, the panel has **Reset all**, and **Copy CSS** gives you the values as a block you can paste into the page's own stylesheet.

Values save as you go and survive a restart. Everything you change in one sitting is kept as a single entry under **History → Earlier tweak values**, so a long session of adjusting is one thing to go back to rather than fifty — and **Reset all** is undoable for the same reason.

A control that would not visibly change anything is dropped before you see it — a page that never uses the value it was meant to set. When that happens the panel says how many were left out, and expands to say why.

### Art

Designs can use pictures that do not exist yet — a hero image, a texture, a background. The model asks for them while it builds, and you can ask for them yourself from the **Art** tab.

Artwork belongs to the design rather than to one variant, so the same picture is available to all of them and stays until you delete it.

Each piece shows what it is, what it cost, and the name the page refers to it by. That name never changes, even if you generate the picture again — so the page keeps working while you try for a better result.

| Button | What it does |
| --- | --- |
| Generate artwork | Ask for a new picture or a short video |
| Retry | Try again for one that failed. The failure stays on the record, and the page needs no change |
| Copy to Library | Copy new artwork into your Library as a reference of its own. Artwork copied from an existing Library item does not offer this action |
| Delete | Hide it from the tray. The file stays until the design is deleted |

Only the buttons that apply are shown: nothing to retry on a picture that worked, and nothing to copy until one has actually arrived. Retry appears only where trying again could give a different answer — a provider that was busy, or a run that never finished. Where the request itself was refused, trying again would only be refused the same way, so the button is not offered.

If the provider is unavailable, you get a placeholder you can retry rather than a design that failed. If Sero closes while a picture is generating, it comes back as something you can retry — it is never generated again on its own, because the provider may already have charged for the first attempt.

### Asking for changes

The box under the preview asks for a change to the variant on screen: *"make the metrics tighter"*, *"try a lighter surface"*. The run is given the page it is editing, so it changes what you asked about and leaves the rest alone.

Beside the box you choose what happens to the result you already have:

| Choice | What happens |
| --- | --- |
| Replace it | The new result takes its place. History marks the old result as replaced, but you can still bring it back |
| Keep both | The new result opens, and the old result stays as an equal alternative in History |

Your choice is remembered as the default, and can also be changed in Settings. Nothing is ever deleted by revising — revisions stay until you delete one yourself.

## Gallery

Choose **Save to Gallery** when a Design revision is worth keeping. The save contains its own source files, effective Tweaks values, artwork, references, guardrails and provenance. It also stores a small PNG preview for the Gallery card. The preview is not the exported design and does not need full output resolution.

Each Design has one Gallery family. Saving it again adds another immutable version to the same card and makes the new version featured. Use the version selector to inspect an older save or feature it again.

The Gallery rail shows live family totals for all designs, favourites, recent saves, and Trash. The Gallery tab shows the same family total. Search works like Library search and narrows live Gallery items and Trash by title.

| Action | What it does |
| --- | --- |
| Open icon | Opens the source Design at the exact saved revision |
| Duplicate | Creates an exact editable copy in a new family |
| Remix | Opens generation with the saved brief and references filled in |
| Delete version | Moves one saved version to Gallery Trash |
| Delete family | Moves the full family to Gallery Trash |

Deleted versions and families remain recoverable until you delete them permanently from Gallery Trash. Each version owns its files and artwork, so deleting the source Design, a Design asset or a Library reference cannot change the saved result.

### Exporting a saved version

Open a Gallery card's action menu and choose **Export to Downloads** or **Export to workspace**. Export always uses the version selected on that card. It does not use the featured version unless that is the selected one.

The workspace destination creates one folder named after the Design at the active workspace root. Exporting that Design again replaces its earlier managed export. Design Library does not replace an unrelated folder with the same name. The Downloads destination creates the design folder in your Downloads directory.

Export progress and completion appear in a compact notification. Use its action to show a Downloads export in your file manager or open a workspace export in Sero Explorer.

Each export contains:

- `index.html` — the runnable standalone page;
- `source/` — the exact files saved in Gallery;
- `assets/` — every piece of artwork the page uses;
- `fonts/` — any selected Design fonts;
- `effective-tweaks.css` — the saved values as ordinary CSS;
- `design-library.json` — Gallery provenance, dependencies, Tweaks and file checksums.

Export verifies the saved Gallery files before it writes. It never regenerates and never reads the mutable source Design. The page applies the saved Tweak values directly and runs without Sero or the Tweaks panel. CSS motion also follows the operating system's reduced-motion preference.

## Generating references

You can also generate straight into the Library, from the **Generate** button in the header.

| What | How |
| --- | --- |
| A new image or video from a description | **Generate**, then choose the media type |
| A new image based on a reference | Select one reference, choose **Remix**, then **Image** |
| A restyled image based on a reference | Select one reference, choose **Remix**, then **Restyle** |
| A video based on a reference | Select one reference, choose **Remix**, then **Video** |
| A sharper copy | Select one reference, choose **Remix**, then **Upscale** |

Generated references arrive in the Library like any other and are read by the Librarian automatically. Open one to see the original prompt and model at the end of the inspector. While one is on its way it shows as a tile in the grid, so you can see that it is coming rather than wondering whether the button worked.

### Video

Video is the most expensive thing here, so it always asks before it spends — including when the model asks for it in the middle of building a design. The confirmation says how long the clip will be, because that is what you are being asked to pay for.

The lengths on offer come from the video model itself, not from a list kept here: one model makes clips of exactly 5 or 10 seconds, another does 4, 6 or 8. Change the model in Settings and the lengths change with it. If the model cannot be asked — an unusual endpoint, or no connection at that moment — the clip runs to whatever length that model produces by default, and the confirmation says so.

There is an upper limit of 12 seconds on anything one press can buy. If the video model in Settings makes nothing shorter than that, the plugin says so and refuses rather than quietly buying its shortest clip. Choose a model with shorter clips.

A video needs Sero to be open to get its thumbnail: the frames are captured by the app, not in the background. One generated while Sero was closed shows as still working until the next time you open it, at which point it gets its thumbnail and is read like anything else. The Librarian is shown a strip of frames from across the clip, so it can describe the movement as well as the look.

Until the thumbnail arrives the tile says **Capturing frames…** rather than showing a broken picture. Opening a clip plays it in place, with the usual controls.

Importing your own video files is not supported yet.

## Sprite Studio

Sprite Studio turns a character, or a picture of one, into finished 2D sprite sheets with animations. You describe what you want in plain words — "a resting loop, two attacks, a jump and a death" — and get back sprite sheets with hard pixels, one shared palette, planted feet and a machine-readable atlas.

### The character comes first

Start from a picture you upload, a reference already in the Library, or a description alone.

Sprite Studio measures the picture rather than guessing at it. Pixel art has two sizes — the file you have and the artwork inside it — so it finds the real one by looking at where the colour edges fall. A 784 × 1168 file whose artwork is 62 × 136 comes back at 62 × 136. It then reads the palette, cuts the background, and finds the foot line.

You see all of that on the **character sheet**, beside the picture you gave it, before anything is generated. Here you can:

- **cap the palette** — 32, 16, 8, or a fixed set of your own. The character is redrawn on the smaller palette immediately, so you see what the cap costs before you accept it;
- **set the export scale**, which must be a whole number or the pixels blur;
- **write style notes** — the hat, the satchel, the whip — which every animation is held to.

Nothing is generated until you approve the character. The palette, the size and the foot line then belong to it, and every animation inherits them. That is what lets you come back next week, ask for a jump, and get a sprite that matches.

### Asking for animations

Describe the animations you want. Sprite Studio plans them and shows you the plan — a name, a frame count, a play rate, a canvas and whether each one loops — before a penny is spent. Change anything you like.

**Frame count and play rate are separate.** The frame count describes the shape of the action, not how fast it plays; each drawing is held for several ticks. How many frames you actually end up with is measured from the finished clip and shown to you to change.

The **video model is chosen here, in the open**, because it changes the result more than any other control and the two models fail in opposite directions:

| Model | What it does | What it costs you |
| --- | --- | --- |
| Grok Imagine | More character in the movement: a real crouch, arms out, legs apart, a proper landing | The face drifts, which reads as style. It occasionally draws a box around a bright character |
| Seedance Fast | Follows the instruction closely and holds the face steady | Stiff — it can move a standing pose up and down rather than animate it |

Your choice is remembered for next time.

### You choose the frames

A video model draws the movement, and then **every clip stops for you before anything is built**. One screen shows two players side by side: the clip on the left, and on the right the frames you have kept, playing as the finished sprite. Underneath is every moment of the clip drawn as the sprite it would become, with the ones Sprite Studio would keep already marked. Click any frame to keep it or drop it — the sprite on the right changes as you do — then press **Use these frames**.

The sprite plays at the speed it will be built at. You can slow it down, speed it up or change how it loops to look at it; those controls change what you see, not what gets made.

Nothing on that screen costs money. The clip is already paid for, so changing the frames is free, and turning down a bad take here saves every redraw that would have followed. The two buttons that do spend money — drawing the clip again, with or without a changed instruction — say so beside themselves.

Ask for one animation and its review opens as soon as it is ready. Ask for five and the reviews open together at the end, so a batch is not interrupted five times.

Sprite Studio's suggestion comes from the clip rather than from a number decided beforehand: it keeps adding frames while each new one still shows you something the ones you have do not. How many that is depends on the clip — a resting loop lands around ten, a busy attack around fifteen. It is a suggestion, and this screen is where you overrule it.

Each kept frame holds for the time it really held in the clip, so the animation plays at the speed it was drawn at. Dropping a frame lengthens the one before it rather than shortening the animation.

### What happens to the drawings

Every frame is checked before it is accepted: the palette, the character's size, whether anything unattached was drawn, whether the feet are where the plan said, whether the sprite boils where it should be still, and whether the drawing ran off the edge of the video frame.

A frame that fails is redrawn automatically, up to twice. Four frames per animation are redrawn at most — each redraw is a paid call, and a clip with more wrong than that is one to run again. Every outcome is declared rather than hidden: which frames were repaired, which redraws were paid for and refused, and which frames the limit could not reach.

The frames are also checked against the base pose by an AI, one at a time, to catch a hat or a satchel that has quietly turned into something else. That check only ever warns. If it cannot run, the animation says so rather than looking as though it passed.

Clips are decoded by the app, so Sprite Studio needs Sero open to finish an animation. One generated while Sero was closed picks up where it left off next time you open it. A clip your machine cannot open is reported as a failure you can run again, not left spinning.

### Getting about, and deleting things

The trail at the top of every screen — **Sprite Studio › Explorer › Resting loop** — is clickable, so the character sheet and the shelf are always one click away.

Each animation in the list has a delete control. It asks first and tells you what goes: the frames, and the clip they were made from, which is the part that cost money. There is no undo, so it says so plainly.

A character you delete is kept. It disappears from the shelf and moves to **Deleted**, where you can restore it or clear it out for good.

A run in progress can be stopped from the button beside **Add animation**.

### Looping

A loop is one of three things, and Sprite Studio says which you have:

- **once** — a jump, an attack, a death;
- **forward** — offered only when the character really does return to a pose it held. It is found by comparing every pair of moments in the clip;
- **ping-pong** — plays forward then backward. It can never fail to join, because both ends are the same frame. It suits breathing, hovering and bouncing, and it does not suit a walk.

**Some walks cannot be looped at all.** About three in five come back with no repeated pose anywhere in them, and no amount of cutting produces a cycle. When that happens Sprite Studio says so and offers the three honest answers: generate it again, ping-pong it and accept the reversed motion, or fix it by hand. It will not quietly ship a walk that jerks every cycle.

### Fixing

Two ways, and **both are available on every frame at all times** — not only when a check failed. A frame can pass every measurement and still be wrong to your eye.

- **Ask the AI** to redraw a frame or re-run a whole animation. Say what is wrong, or say nothing and let it work it out. Repairs are added rather than substituted, so the previous version survives.
- **Edit it yourself** — pencil, eraser, eyedropper, fill, undo and onion skin, with the character's palette as the only colours available. A hand edit cannot break the palette.

Each frame holds for the time it really held in the clip. **How long it holds** on the frame panel changes that, in milliseconds, when a pose needs a beat longer.

### Export

One PNG sheet and one Aseprite JSON file, which most engines and tools already read. The anchor, the palette and the character id travel inside the atlas, so a game does not have to be told where the character's feet are.

The scale must be a whole number. Ask for a 512 px tall sprite from a 136 px character and you get the nearest whole multiple, with the real size stated rather than blurred pixels. Optional: trim to content, and one cell size for every animation for engines that expect a uniform grid.

The two files go to your Downloads folder, and a line at the top of the page says where they went and how big the sprite is.

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
| Media models | The provider's defaults | Search loaded models by name or endpoint for each kind of generation. Choices are grouped by model provider and show the endpoint below the readable name. You can enter an endpoint that is not listed. Use the info icon beside a label to see where that model is used |
| Media calls per run | 4 | Use the stepper buttons or enter a number to set how many pictures one design run may ask for. Going over stops further calls and says so, and the design still finishes |
| Provider key | From the environment | See below |

For Librarian and Design models, clearing the choice uses Sero's configured model. For media models, choose **Provider default** to use the provider's default.

Sero caches the media model list after it loads. If the provider cannot load the list, Settings shows the error and a **Retry** action. Saved choices and manual endpoint entry still work.

### The picture provider

Generating pictures needs a key for [fal.ai](https://fal.ai). Sero looks for `FAL_KEY` in the environment first, and falls back to a key you paste into Settings. Settings only ever tells you where the key came from — the environment, saved here, or missing — and never shows the key itself.

A key saved in Settings is stored on your machine, readable only by you, at the same level of protection as Sero's other credentials. If you have `FAL_KEY` set in the environment, that one wins and Settings says so.

## What the agent can do

Design Library exposes its read surface to the main Sero agent, so you can work from any chat.

| Tool | What it does |
| --- | --- |
| `design_library_items` | Search references, read one in full, edit or reset analysis fields, favourite, collect, delete and restore |
| `design_library_analysis` | Check analysis status, reanalyse, cancel or retry |
| `design_library_designs` | List and read designs, preview the combined guardrails, start a design from named references, retry, stop or revise a variant, switch or delete revisions, and set tweak values |
| `design_library_media` | Generate artwork into a design or straight into the Library, list it, retry, delete and copy to the Library |
| `design_library_gallery` | List saved families, read versions, open or duplicate an exact revision, feature versions, and manage Gallery Trash |
| `design_library_export` | Export an exact Gallery version to Downloads or the active workspace, and read export status |
| `design_library_sprites` | Read Sprite Studio characters and animations, ask for animations, approve, fix a frame and export a sprite sheet |

Ask things like *"what dark, data-dense references do I have?"*, *"reanalyse the Northstar screenshot"*, *"make a dashboard from the Northstar and Material journal references"*, *"revise variant 2 to use a lighter surface"*, or *"generate a dark metallic texture into the Library"*.

## Where things are stored

Everything lives in the active profile's Sero home under `apps/design-library/`: the original images, their previews, the analysis records, every generated design, immutable Gallery versions, Sprite Studio characters under `characters/`, and the search index. Every sprite frame is an indexed PNG carrying its character's palette, so a frame cannot hold a colour the character does not have. Generated pictures are downloaded and kept locally too — a design never points at a web address.

What leaves your machine: the image sent to your configured model for analysis, the written description sent when you generate a design, and the prompt sent to the picture provider when you generate artwork.

Deleting a profile deletes its library. There is no cloud copy.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [Models and Providers](/guide/models-and-providers)
- [Security / Privacy](/reference/security-privacy)
