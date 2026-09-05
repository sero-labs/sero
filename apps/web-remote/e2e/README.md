# Visual regression for Sero Remote

These tests photograph the browser client and compare each shot with a
stored one. A difference means the interface moved.

## Running them

```bash
pnpm --filter @sero/web-remote e2e
```

The run starts a gateway stand-in on port 18899 and a dev server on
5175. The stand-in answers with fixed data and a fixed clock, so a shot
only changes when the interface does.

## After a deliberate change

```bash
pnpm --filter @sero/web-remote e2e:update
```

Look at the new images before you commit them. That is the review.

## What is covered

Three screens — the board, a conversation, the notification feed — at
1100×760, 1440×900 and 390×844, in both themes. Eighteen shots.

## A limit worth knowing

Baselines carry the platform in their name (`…-darwin.png`) because text
renders differently on each operating system. A macOS baseline will not
match a Linux run. To run these in CI, generate the baselines in the same
container CI uses.
