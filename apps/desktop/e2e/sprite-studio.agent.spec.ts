/**
 * Sprite Studio, end to end, in the real app.
 *
 * A picture of a character goes in; a sprite sheet and an Aseprite atlas come
 * out. Every stage in between runs for real — ingestion measures the artwork, a
 * model plans the animations, a video model draws the movement, the renderer
 * pulls the frames out of the clip because the runtime has no codecs, the run
 * stops at the review for the frames to be picked, the engine quantises and
 * plants the root, and the export writes two files.
 *
 * It is one story told as nine tests so that a failure names its stage.
 *
 * **Why this exists.** Every unit test, every typecheck and every plugin build
 * passed while the feature was dead on arrival in Sero: a field the page waited
 * on that nothing ever wrote. Nothing but running it finds that.
 *
 * ## Running it
 *
 * ```
 * cd apps/desktop && npm run build
 * npx playwright test sprite-studio --project=agent
 * ```
 *
 * The **first run on a machine costs money** — one clip and a few repairs,
 * about $0.40 at 480p — and records them into a cassette that is not committed,
 * because it is megabytes of video. Every run after that replays it, free, in
 * under a minute. Delete the cassette folder to re-record, which is also how a
 * change to the plate, the prompts or the checks gets picked up.
 *
 * `FAL_KEY` is read from the repo-root `.env`, and is only needed while
 * recording. See `docs/features/sprite-studio/testing.md`.
 *
 * Screenshots land in `e2e/screenshots/sprite-studio/` as review evidence —
 * and looking at them is the point, because five times during this feature's
 * investigation a measurement said one thing and the picture said another.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  collapseShellPanels,
  createTempSeroHome,
  getLlmLaunchEnv,
  launchSeroApp,
  requireLlmReady,
  seedWorkflowProfile,
  waitForShell,
  type TempSeroHome,
} from './helpers';
import {
  activeProfilePath,
  designLibraryHome,
  listAnimationRecords,
  listCharacterRecords,
  openSpriteStudio,
  patchSpriteSettings,
  readPngHeader,
  readSpriteState,
  spriteStudioPanel,
  until,
  type SpriteAnimationRecord,
  type SpriteCharacterRecord,
} from './helpers/sprite-studio';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SHOTS = path.resolve(__dirname, 'screenshots', 'sprite-studio');
const REFERENCE = path.resolve(__dirname, 'fixtures/sprite-studio/explorer-reference.png');

/** Where recorded video calls live, so a rerun costs nothing. */
const CASSETTE =
  process.env.SPRITE_E2E_CASSETTE ??
  path.resolve(__dirname, 'fixtures/sprite-studio/cassette');

/**
 * Seedance Fast, because Grok's results vary too much to assert on.
 *
 * It is the stiffer of the two and that is fine here: this proves the pipeline
 * runs, not that the animation is beautiful.
 */
const VIDEO_MODEL = 'bytedance/seedance-2.0/fast/image-to-video';

/** What the character is measured as. Proven: 496 × 1088 of artwork at 8×. */
const ART_WIDTH = 62;
const ART_HEIGHT = 136;
const ART_BLOCK = 8;

const ASK = 'Give me one resting loop of six frames at 30fps. Nothing else.';

/** What plans the animations when the login is borrowed from this machine. */
const PLAN_PROVIDER = process.env.SPRITE_E2E_PLAN_PROVIDER ?? 'openai-codex';
const PLAN_MODEL = process.env.SPRITE_E2E_PLAN_MODEL ?? 'gpt-5.4-mini';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let libraryHome: string;
let downloads: string;
let character: SpriteCharacterRecord;
let animation: SpriteAnimationRecord;

/**
 * The developer's own model login, lent to the temporary profile.
 *
 * Planning is a real model call and there is no `.env.test` on this machine, so
 * without this the whole spec skips. Only the login and a model choice are
 * written — the temporary profile gets no data, and the real profile is never
 * opened by the app under test.
 *
 * It has to run **between** two launches: the first launch is what creates the
 * profile, and onboarding writes an empty `auth.json` over anything seeded
 * before it. `SPRITE_E2E_BORROW_AUTH=0` turns it off.
 */
function lendModelLogin(intoProfile: string): boolean {
  if (process.env.SPRITE_E2E_BORROW_AUTH === '0') return false;
  const registry = path.join(os.homedir(), '.sero-ui', 'profiles.json');
  if (!fs.existsSync(registry)) return false;

  const parsed = JSON.parse(fs.readFileSync(registry, 'utf8')) as {
    activeProfileId?: string;
    profiles?: { id: string; path: string }[];
  };
  const active =
    parsed.profiles?.find((one) => one.id === parsed.activeProfileId) ?? parsed.profiles?.[0];
  const from = active === undefined ? null : path.join(active.path, 'agent');
  if (from === null || !fs.existsSync(path.join(from, 'auth.json'))) return false;

  const into = path.join(intoProfile, 'agent');
  fs.mkdirSync(into, { recursive: true });
  fs.copyFileSync(path.join(from, 'auth.json'), path.join(into, 'auth.json'));

  // The login travels; the model choice does not. A developer's default may be
  // routed through a local proxy that is not running here, and planning would
  // then fail on "no API key" for a model this profile cannot reach. The tiers
  // matter as much as the default, because planning runs as a background
  // subagent and a profile with no tiers gives it no model to run on.
  const settingsFile = path.join(into, 'settings.json');
  const settings = fs.existsSync(settingsFile)
    ? (JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>)
    : {};
  const tier = { provider: PLAN_PROVIDER, modelId: PLAN_MODEL, thinkingLevel: 'low' };
  fs.writeFileSync(
    settingsFile,
    `${JSON.stringify(
      {
        ...settings,
        defaultProvider: PLAN_PROVIDER,
        defaultModel: PLAN_MODEL,
        sero: {
          ...((settings.sero ?? {}) as Record<string, unknown>),
          modelTiers: { LOW: tier, MED: tier, HIGH: tier },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return true;
}

/** The fal key, sourced rather than read: it must not reach a log. */
function falKeyFromRepoEnv(): string | undefined {
  const file = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?FAL_KEY\s*=\s*(.*)$/.exec(line);
    if (match?.[1] === undefined) continue;
    return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/** One clip at a time, because the cassette replays entries in call order. */
const SPRITE_SETTINGS = {
  videoModel: VIDEO_MODEL,
  // The endpoint that can actually edit the frame it is handed. Naming a
  // superseded one here would be rewritten by the start-up migration anyway,
  // and the test would then be measuring something it did not ask for.
  repairModel: 'fal-ai/nano-banana-2/edit',
  // Cheaper and quicker than 720p, and this is about the pipeline running
  // rather than the sprite being beautiful.
  resolution: '480p',
  concurrency: 1,
  sampleFps: 8,
};

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name) });
}

/**
 * Planning is a real model call, so one of two things has to be true: an
 * `.env.test` with a key, or a model already logged in on this machine.
 */
const configured = requireLlmReady();
const canBorrow =
  process.env.SPRITE_E2E_BORROW_AUTH !== '0' &&
  fs.existsSync(path.join(os.homedir(), '.sero-ui', 'profiles.json'));
const gate = configured.skip && !canBorrow ? configured : { skip: false, reason: undefined };

test.describe.configure({ mode: 'serial' });
test.skip(gate.skip, gate.reason);

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(CASSETTE, { recursive: true });

  home = createTempSeroHome();
  const profile = seedWorkflowProfile(home, { name: 'Sprite Studio e2e' });
  downloads = path.join(home.path, 'Downloads');

  const falKey = falKeyFromRepoEnv();
  const launch = async (): Promise<void> => {
    ({ app, page } = await launchSeroApp({
      seroHome: home.path,
      runtime: 'host',
      env: {
        ...getLlmLaunchEnv(),
        // The plugin exports into the home directory's Downloads folder, and
        // this keeps that inside the temporary home rather than the user's.
        HOME: home.path,
        USERPROFILE: home.path,
        SERO_FIXED_ROOT_OVERRIDE: profile.path,
        SERO_DESIGN_LIBRARY_MEDIA_CASSETTE: CASSETTE,
        ...(falKey === undefined ? {} : { FAL_KEY: falKey }),
      },
    }));
    await waitForShell(page);
  };

  await launch();

  // Read after launch, not predicted before it: the app owns where the profile
  // ends up, and a guess would leave the test watching an empty directory.
  const profilePath = activeProfilePath(home.path);
  if (configured.skip && lendModelLogin(profilePath)) {
    // The profile only exists once the app has made it, and onboarding writes
    // an empty `auth.json` over anything seeded earlier — so the login goes in
    // now, and the app is started again to read it.
    await closeApp(app);
    await launch();
  }

  libraryHome = designLibraryHome(profilePath);
  patchSpriteSettings(libraryHome, SPRITE_SETTINGS);

  // Sprite Studio carries a rail, a wide surface and a detail panel, so it gets
  // the whole window rather than a third of it.
  await collapseShellPanels(page);

  // Opened here rather than in the first test, so running one stage on its own
  // still lands on the right surface.
  await openSpriteStudio(page);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    // `SPRITE_E2E_KEEP=1` leaves the temporary home behind, which is the only
    // way to look at what the runtime actually wrote after a failure.
    if (process.env.SPRITE_E2E_KEEP === '1') {
      console.log(`kept: ${home.path}\nlibrary: ${libraryHome}`);
    } else {
      home?.cleanup();
    }
  }
});

test('Sprite Studio opens on an empty shelf', async () => {
  const panel = spriteStudioPanel(page);
  await expect(panel.getByRole('button', { name: 'New character' }).first()).toBeVisible({
    timeout: 15_000,
  });
  await shot('01-empty-shelf.png');
});

test('a reference picture is measured into a character', async () => {
  test.setTimeout(120_000);
  const panel = spriteStudioPanel(page);

  await panel.getByRole('button', { name: 'New character' }).first().click();
  await page.locator('#character-name').fill('Explorer');
  // Straight at the input the button opens: a real file picker cannot be
  // driven, and this is the same element it would have filled.
  await page
    .getByRole('dialog', { name: 'New character' })
    .locator('input[type="file"]')
    .setInputFiles(REFERENCE);
  await page.getByRole('button', { name: 'Measure it' }).click();

  character = await until(
    'the character to be measured',
    () => listCharacterRecords(libraryHome)[0],
    90_000,
  );

  // The measurements, not a spinner that stopped. A reference at 8× that comes
  // back as its own file size means the art grid was never found.
  expect(character.artWidth).toBe(ART_WIDTH);
  expect(character.artHeight).toBe(ART_HEIGHT);
  expect(character.ingestion.block).toBe(ART_BLOCK);
  expect(character.ingestion.lift).toBeGreaterThan(2);
  expect(character.palette.length).toBeGreaterThan(8);
  expect(character.root.footRow).toBeGreaterThan(ART_HEIGHT / 2);

  // Both pictures on the character sheet, whole. The reference was once cut off
  // at the knees by a percentage the browser ignored.
  await expect(panel.getByText('The artwork underneath')).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText(`${ART_WIDTH} × ${ART_HEIGHT}`)).toBeVisible();
  const artwork = panel.getByAltText('Explorer', { exact: true });
  await expect(artwork).toBeVisible();
  expect((await artwork.boundingBox())?.height ?? 0).toBe(ART_HEIGHT * 2);

  // The reference, shrunk to its pane rather than overflowing it. It once
  // rendered 1060 px tall in a 646 px box and lost the character's legs.
  const reference = panel.getByAltText(/measured from/);
  await expect(reference).toBeVisible();
  const shown = await reference.boundingBox();
  const pane = await panel.getByText('The file you gave me').locator('..').boundingBox();
  expect(shown?.height ?? 0).toBeGreaterThan(0);
  expect(shown?.height ?? 0).toBeLessThanOrEqual(pane?.height ?? 0);
  await shot('02-character-sheet.png');

  // Nothing was refused on the way.
  expect(readSpriteState(libraryHome)?.sprite.notice).toBeUndefined();
});

test('approving the character is what unlocks generation', async () => {
  const panel = spriteStudioPanel(page);
  await panel.getByRole('button', { name: 'Approve character' }).click();

  const approved = await until(
    'the character to be approved',
    () => listCharacterRecords(libraryHome).find((one) => one.status === 'approved'),
    30_000,
  );
  expect(approved.id).toBe(character.id);
  await shot('03-approved.png');
});

test('plain words become a plan', async () => {
  test.setTimeout(300_000);
  const panel = spriteStudioPanel(page);

  // The character sheet's button, not the rail's icon of the same name.
  await panel.getByRole('button', { name: 'Add animations', exact: true }).last().click();
  await page.getByLabel('What you want').fill(ASK);
  await page.getByRole('button', { name: 'Seedance Fast' }).click();
  await page.getByRole('button', { name: 'Plan it' }).click();

  // The dialog once span here for ever, because it watched for a record the
  // runtime does not write. It watches the plan now.
  await expect(page.getByText('The plan')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText(/\d+ frames/).first()).toBeVisible();
  await shot('04-plan.png');
});

test('the clip stops at the review before anything is built', async () => {
  // A clip, then sixty-odd frames decoded in the renderer and compiled. Long,
  // and long is not the same as stuck.
  test.setTimeout(900_000);
  const panel = spriteStudioPanel(page);

  await page.getByRole('button', { name: /^Start · / }).click();

  const clipped = await until(
    'the clip to arrive and its frames to be wanted',
    () =>
      readSpriteState(libraryHome)?.sprite.animations.find(
        (one) => one.awaitingFrames !== undefined || one.status !== 'planned',
      ),
    600_000,
  );
  expect(clipped.status).not.toBe('failed');

  // Nothing is built until a person has said so. This is the whole gate: the
  // clip is paid for, the samples are on disk, and the run stops here.
  const proposed = await until(
    'the frames to be proposed',
    () =>
      listAnimationRecords(libraryHome, character.id).find(
        (one) => one.status === 'awaiting-review' || one.status === 'failed',
      ),
    600_000,
  );
  expect(proposed.error ?? '').toBe('');
  expect(proposed.status).toBe('awaiting-review');
  expect(proposed.frames.length).toBe(0);

  // A proposal that names samples nothing wrote is the fault this feature
  // produces over and over, so both halves are checked against each other.
  const review = proposed.review;
  expect(review?.sampleCount ?? 0).toBeGreaterThan(2);
  expect(review?.proposed.length ?? 0).toBeGreaterThanOrEqual(2);
  expect(review!.proposed.length).toBeLessThan(review!.sampleCount);
  const previews = fs.readdirSync(
    path.join(libraryHome, 'characters', character.id, 'animations', proposed.id, 'samples'),
  );
  expect(previews.length).toBe(review!.sampleCount);

  await expect(panel.getByText(/\d+ of \d+ chosen/)).toBeVisible({ timeout: 60_000 });

  // The take and the sprite, both playing. A clip that looks right at 480p can
  // fall apart at 62 × 136, so the screen shows the thing that will be shipped
  // beside the thing that was drawn.
  await expect(panel.locator('video')).toBeVisible();
  await expect(
    panel.getByText(new RegExp(`^\\d+ / ${review!.proposed.length}$`)),
  ).toBeVisible({ timeout: 60_000 });
  // At the speed it will be built at, which is the clip's own. A flat rate here
  // would be a preview of an animation nobody is going to get (D23).
  await expect(panel.getByRole('combobox', { name: 'Speed' })).toHaveText(/As timed/);

  await shot('05-review.png');
});

test('changing the frames changes what gets built', async () => {
  test.setTimeout(900_000);
  const panel = spriteStudioPanel(page);

  // Drop one of the proposed frames, so the sequence that comes out cannot be
  // the one the selector would have produced on its own.
  const before = listAnimationRecords(libraryHome, character.id).find(
    (one) => one.status === 'awaiting-review',
  )!;
  const wanted = before.review!.proposed.length - 1;
  // Anchored: "Frame 1" also matches "Frame 10" through "Frame 19".
  await panel.getByRole('button', { name: new RegExp(`^Frame ${before.review!.proposed[0]! + 1}$`) }).click();
  await panel.getByRole('button', { name: `Use these ${wanted} frames` }).click();

  animation = await until(
    'the sequence to be built',
    () =>
      listAnimationRecords(libraryHome, character.id).find(
        (one) => one.status === 'ready' || one.status === 'failed',
      ),
    600_000,
  );

  // Exactly what was asked for, not what was proposed.
  expect(animation.frames.length).toBe(wanted);
  // The review is over, so its samples are gone rather than left on disk.
  expect(animation.review).toBeUndefined();
  expect(
    fs.existsSync(
      path.join(libraryHome, 'characters', character.id, 'animations', animation.id, 'samples'),
    ),
  ).toBe(false);
});

test('the built sequence is a real indexed sprite', async () => {
  test.setTimeout(120_000);

  expect(animation.error ?? '').toBe('');
  expect(animation.status).toBe('ready');
  expect(animation.frames.length).toBeGreaterThan(0);
  expect(animation.canvas.cols).toBeGreaterThan(0);
  expect(animation.canvas.rows).toBeGreaterThan(0);

  // Every frame is on disk, indexed, and the size the canvas says.
  for (const frame of animation.frames) {
    const header = readPngHeader(path.join(libraryHome, frame.file));
    expect(header.colourType, `${frame.file} must be an indexed PNG`).toBe(3);
    expect(header.width).toBe(animation.canvas.cols);
    expect(header.height).toBe(animation.canvas.rows);
    expect(header.paletteEntries).toBeGreaterThan(1);
    expect(frame.durationMs).toBeGreaterThan(0);
  }

  // The identity judge is advisory, so it cannot fail the run — which is
  // exactly why it has to be checked here. It once failed on every frame of a
  // sequence and said nothing, and the checkpoint read as if the character had
  // been looked at and found correct.
  const unjudged = animation.findings.find(
    (finding) => finding.check === 'identity' && finding.message.includes('Nobody looked'),
  );
  expect(unjudged?.message ?? 'the judge ran').toBe('the judge ran');

  await expect(page.getByText('Checkpoint 2 of 2')).toBeVisible({ timeout: 60_000 });
  await shot('06-checkpoint.png');
});

test('the checkpoint approves and the workbench opens', async () => {
  test.setTimeout(120_000);
  const panel = spriteStudioPanel(page);

  await panel.getByRole('button', { name: /^Approve/ }).click();
  await until(
    'the animation to be approved',
    () =>
      listAnimationRecords(libraryHome, character.id).find((one) => one.status === 'approved'),
    60_000,
  );

  await expect(panel.getByRole('button', { name: 'Export sheet' })).toBeVisible({
    timeout: 30_000,
  });
  await shot('07-workbench.png');
});

test('exporting writes a sheet and an atlas', async () => {
  test.setTimeout(180_000);
  const panel = spriteStudioPanel(page);

  await panel.getByRole('button', { name: 'Export sheet' }).click();
  await expect(panel.getByRole('button', { name: /^Export · / })).toBeVisible({ timeout: 30_000 });
  await shot('08-export.png');
  await panel.getByRole('button', { name: /^Export · / }).click();

  const sheet = await until(
    'the sheet to be written',
    () => {
      if (!fs.existsSync(downloads)) return null;
      const found = fs.readdirSync(downloads).find((name) => name.endsWith('.png'));
      return found === undefined ? null : path.join(downloads, found);
    },
    120_000,
  );
  const atlas = sheet.replace(/\.png$/, '.json');
  expect(fs.existsSync(atlas)).toBe(true);

  const header = readPngHeader(sheet);
  expect(header.colourType).toBe(3);
  expect(header.width).toBeGreaterThan(0);
  expect(header.height).toBeGreaterThan(0);

  const parsed = JSON.parse(fs.readFileSync(atlas, 'utf8')) as {
    frames?: unknown[] | Record<string, unknown>;
    meta?: { sero?: { anchors?: unknown[]; palette?: unknown[] } };
  };
  const frameCount = Array.isArray(parsed.frames)
    ? parsed.frames.length
    : Object.keys(parsed.frames ?? {}).length;
  expect(frameCount).toBe(animation.frames.length);
  expect(parsed.meta?.sero?.palette?.length ?? 0).toBeGreaterThan(1);

  // The sheet has to hold every frame side by side, or it is a sheet of one.
  expect(header.width).toBeGreaterThanOrEqual(animation.canvas.cols);
});
