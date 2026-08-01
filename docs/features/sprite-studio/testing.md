# Testing Sprite Studio

Sprite Studio has 900-odd unit tests, and every one of them passed while the
feature was dead on arrival in Sero. The engine was right, the runtime was
right, the page was right, and a field the page waited on was never written by
anything — so a clip was generated, paid for, stored, and never opened.

Nothing but running the whole thing in the real app finds that. So there is an
end-to-end test, and it is the one that decides whether Sprite Studio works.

## The end-to-end test

`apps/desktop/e2e/sprite-studio.agent.spec.ts` drives the built Electron app
through the whole story, as seven stages so a failure names its own:

1. Sprite Studio opens on an empty shelf
2. a reference picture is measured into a character — 496 × 1088 in, 62 × 136 at
   8× out, both pictures whole on screen
3. approving the character is what unlocks generation
4. plain words become a plan — a real model call
5. the plan produces a finished sequence — a real video call, frames pulled out
   in the renderer, compiled, repaired, judged
6. the checkpoint approves and the workbench opens
7. exporting writes a sheet and an atlas — read back off disk and checked

Screenshots land in `apps/desktop/e2e/screenshots/sprite-studio/`. **Look at
them.** Five times during this feature's investigation a measurement said one
thing and the picture said another, and every time it was looking at the output
that caught it.

## Running it

```bash
pnpm --filter @sero-ai/plugin-design-library build   # after any plugin change
cd apps/desktop && npm run build                     # after any host change
npx playwright test sprite-studio --project=agent
```

`SPRITE_E2E_KEEP=1` leaves the temporary Sero home behind and prints its path,
which is the only way to read what the runtime actually wrote after a failure.

## Why it does not cost money every time

The first run **on each machine** records every fal call into
`apps/desktop/e2e/fixtures/sprite-studio/cassette/` — the clips and images
themselves, plus a manifest saying what was asked for. Every run after that
replays them, so the full test is free and takes under a minute.

The cassette is **not committed**: it is several megabytes of video and
generated pictures, and it is build output rather than source. Expect the first
run to be slow and to cost about $0.40; after that it is free until you delete
the folder.

The cassette is a thin wrapper around the provider
(`plugins/sero-design-library-plugin/runtime/media/cassette.ts`), switched on
only by `SERO_DESIGN_LIBRARY_MEDIA_CASSETTE`. Nothing is faked: the bytes the
pipeline sees are the bytes fal returned.

Entries are matched by capability in call order rather than by prompt, because
the prompt is written by a model and differs every run. That makes the cassette
order-sensitive, which is why the test pins concurrency to one clip at a time.

Delete the cassette directory to re-record — which is also how you pick up a
change to the plate, the prompts or the checks, since any of those makes the
recorded answers the wrong answers.

## Credentials

- **fal** — `FAL_KEY` is read from the repo-root `.env`. With a complete
  cassette it is not needed at all.
- **the model** — planning and the identity judge are real model calls. The
  test uses `apps/desktop/e2e/.env.test` if there is one, and otherwise borrows
  the login from the active profile on this machine, copying only `auth.json`
  into the temporary profile. `SPRITE_E2E_BORROW_AUTH=0` turns that off.

The login has to be copied **between two launches**: the first launch is what
creates the profile, and onboarding writes an empty `auth.json` over anything
seeded before it.

## What the test is for

It is not there to prove the sprite is beautiful — Seedance Fast is the stiffer
of the two models and is chosen here because its results are steady enough to
assert on. It is there to prove that every seam still carries what the next one
expects. Every fault this feature has had has been of one kind: something one
side depends on that the other side never produces. Unit tests cannot see that,
because both sides pass on their own.
