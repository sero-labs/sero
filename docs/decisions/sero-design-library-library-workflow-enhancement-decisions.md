# Design Library library-workflow enhancement decisions

**Status:** Accepted  
**Date:** 2026-07-30  
**Scope:** Post-first-release Library workflow enhancements

This is a separate decision entry for enhancement work. It does not reopen the first-release decisions.

## E1 · Fresh generation and source-led work are separate flows

The Library header **Generate** action offers text-to-image and text-to-video only. It does not show operations that require a source.

The selected-reference **Remix** action opens a source-led panel. That panel separates operations that create new media from operations that edit the current reference.

**Reason.** The current flat capability row mixes two different user intentions. It also allows a selected source to disappear when the user changes to a capability that cannot use it.

**Consequence.** The dialog receives an explicit mode. It does not infer intent only from the current capability.

## E2 · Remix can create an image or a video from a reference

Remix offers source-aware image generation, restyling, and video generation. Image uses the vendor-neutral `reference-to-image` capability. Restyle uses `image-to-image`. Video uses `image-to-video`. Each capability is backed by a configured fal.ai model.

Text-to-video remains the fresh video operation.

**Reason.** New media based on a reference must send that reference to the provider. Reusing text-only capabilities would silently ignore it.

**Consequence.** Settings gain editable reference-to-image and image-to-video model ids. Existing profiles normalize with empty overrides and therefore use the adapter defaults.

## E3 · Remix keeps explicit create and edit actions

The selected-reference action is named **Remix**. **Image** and **Video** remain under **Create new**. **Restyle** and **Upscale** remain under **Edit this reference**.

**Reason.** Image and Restyle have different user intentions. Image makes new artwork that uses the source as visual direction. Restyle edits the source's visual style.

**Consequence.** Image sends `reference-to-image`. Restyle sends `image-to-image`. Existing profiles gain an empty reference-to-image model override and use the fal.ai adapter default.

## E4 · Original provenance is read-only and last

Generated references show an **Original request** section at the end of the inspector. It projects the prompt, operation, and model from the item’s existing generation provenance.

The Librarian’s editable **Generation prompt** stays where it is and keeps its current meaning.

**Reason.** These prompts answer different questions. One records what made this file. The other describes how to make future work in the same language.

**Consequence.** No generation data is copied into the Librarian profile.

## E5 · Large pickers use the shared searchable Combobox

The source picker and facet menus use the searchable Combobox from `@sero-ai/ui`. Its result area has a fixed maximum height.

Facet menus use multi-select. Selection ticks appear on the right through the shared component.

The Colour menu groups exact analysed values into named families such as Reds, Greens, Blues, Purples, and Neutrals. Selecting a family includes all current Library colours in that family.

**Reason.** A plain select or complete menu does not scale to thousands of values. A scroll area alone moves the problem into a long scroll.

**Consequence.** Users type to narrow large lists. Selection, keyboard control, filtering and focus behavior stay consistent with other Sero pickers.

## E6 · Generation choices use shared line tabs

Fresh Generate uses one line-tab row. Remix uses line tabs in two labelled groups:

- **Create new**
- **Edit this reference**

**Reason.** The shared `@sero-ai/ui` line tabs match the inspector and give each group a clear, standard selection state.

**Consequence.** The panel does not implement a local operation picker.

## E7 · Video protections apply to both video capabilities

Mandatory confirmation, duration limits, cost tracking, pending states, frame capture, playback, and Librarian analysis apply to text-to-video and image-to-video.

**Reason.** Source input does not change the spend or lifecycle risks of video generation.

**Consequence.** Shared video checks use an explicit video-capability predicate instead of one direct equality check.

## E8 · Collection membership and deletion are visible

The selected-reference bar lists collections as checked items. Clearing a check removes the selected references from that collection. Each custom collection row has an action menu with **Delete collection**.

**Reason.** An add-only menu and collection rows with no actions hide existing runtime capabilities.

**Consequence.** Deleting a collection returns an active collection view to All inspiration. It does not delete the references in the collection.
