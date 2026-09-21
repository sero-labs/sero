# Capturing a UI surface for review

How to screenshot a built Sero surface and put it beside a prototype drawing, so a
review compares what shipped with what was drawn instead of with what the author
remembers.

The preview harness was built for this. From
`plugins/sero-orchestrator-plugin/ui/__preview__/README.md`:

> The harness makes those faults visible, and it gives a browser a URL to
> screenshot.

Every trap below is one that cost time on the `ux-read-the-outcome` captures.

## The loop

1. **Add a preview** for the surface, in `ui/__preview__/previews.tsx` plus a
   fixture beside it. Render the REAL component. A preview that re-draws a
   surface proves nothing about the surface — `ux-read-the-outcome` moved
   `LoopResult` into its own module precisely so its preview could render the
   real row instead of a copy.

2. **Start the harness.**

   ```bash
   pnpm --filter @sero-ai/plugin-orchestrator preview   # :5199
   pnpm --filter @sero-ai/plugin-architect preview      # :5201
   ```

3. **Screenshot one preview by id.**

   ```bash
   playwright screenshot --viewport-size="1600,1400" --wait-for-timeout=2600 --full-page \
     "http://localhost:5199/ui/__preview__/index.html?preview=room-result" /tmp/shots/room-result.png
   ```

4. **Look at it.** Read the PNG as an image — the `read` tool renders PNG/JPG.
   Comparing the file's byte size tells you nothing.

5. **Capture the drawing too**, then read the two side by side.

   ```bash
   playwright screenshot --viewport-size="1440,1200" --wait-for-timeout=1500 --full-page \
     "file://$PWD/apps/styleguide/public/prototypes/agent-workspace-ux-audit/<drawing>.html" /tmp/shots/drawing.png
   ```

6. **Open every fold on both sides before comparing.** Both v1 defects in this
   audit came from folds that were never opened in the capture.

## Traps, and the fixes

**Screenshot at a viewport wider than the panel.** The harness gives the preview
`width: <panel>` px. Screenshotting a 1440 panel in a 1440 viewport clips its
right edge, because the harness page has its own padding — invisible until you
look, and it reads as a layout bug. Capture at 1600 for a 1440 panel.

**A preview's bridge may already exist.** A fixture that sets the host bridge
with `??=` silently loses to another fixture that got there first, and the
symptom is not an error at the point of use: the surface renders, its data is
just missing. On `ux-read-the-outcome` this made the Room's plan card show a
title with **no sections at all**, and every test still passed. Assign onto the
existing bridge instead:

```ts
const bridge = globalThis as { sero?: { appState?: unknown; appAgent?: { invokeTool?: unknown } } };
bridge.sero ??= { appState: {}, appAgent: {} };
bridge.sero.appAgent ??= {};
bridge.sero.appAgent.invokeTool ??= async () => ({ text: '', content: [], isError: false, details: { ok: true, content: MD } });
```

**Playwright's CLI and its module are different installs with different browser
builds.** `/opt/homebrew/bin/playwright` and a `require('playwright')` from
another directory can resolve to different versions, so the browser one installed
is not the browser the other wants. Install for the one you are actually using:

```bash
playwright install chromium                       # the CLI
node <path-to>/playwright/cli.js install chromium # the module you require
```

**ImageMagick is not installed.** To compose a comparison sheet, do it in the
browser: write an HTML file with both `<img src="file://…">` and screenshot that
page with `fullPage: true`.

**Radix menus and dialogs portal.** A `DropdownMenu` or `AlertDialog` renders into
`document.body`, so a test or a script that queries only the component's container
finds nothing. Query `document.body`, and expect a menu opened by `pointerdown`
rather than `click` — see `ui/__tests__/loop-controls-delete.test.tsx`.

## What captures catch that tests cannot

On `ux-read-the-outcome`, four product faults and no test in the change caught
any of them:

- every `Kv` value right-aligned across a 1188px column and `truncate`d, where the
  drawing has a fixed label column;
- a spend ring with no column of its own;
- `ACCESS` reading `read-only` where the drawing reads `Read-only`;
- `Delivered` printing a raw locale stamp and a raw destination id.

A DOM assertion for the first and third would only have restated the class list.
The capture is the check. Record what each one showed in the change's
`comparison.md`, and say plainly which frames were never compared.
