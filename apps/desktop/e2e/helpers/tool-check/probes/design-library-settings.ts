/**
 * `design_library_settings`: models, defaults, recipes, layout, the saved
 * view, media models and the provider key. Writes queue a request, so each
 * step waits for a read (or the plugin's state file) to show the change;
 * the key actions write `secrets.json` directly. A dummy key is stored: storing
 * one makes no network call (shared/credentials.ts). The model, media model and
 * media cap are put back afterwards.
 * Source: plugins/sero-design-library-plugin/extension/tools/settings.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import {
  invoke, libraryHome, poll, pollText, readJsonFile, readStateFile, saved,
} from './design-library-support';

const TOOL = 'design_library_settings';

interface SettingsView {
  generation: { variantCount: number; revisionBehaviour: string; recipes: Array<{ id: string; name: string }> };
  layout: { inspectorWidth: number; sessionsRailCollapsed: boolean };
  media: { callsPerRun: number };
}

const read = (ctx: StepContext, what: string, test: (text: string) => boolean) => pollText(ctx, what, TOOL, { action: 'read' }, test);

async function settings(ctx: StepContext): Promise<SettingsView> {
  const answer = await invoke(ctx, TOOL, { action: 'read' });
  return (answer.details as { settings: SettingsView }).settings;
}

async function secretsFile(ctx: StepContext): Promise<string> {
  return path.join(await libraryHome(ctx), 'secrets.json');
}

// The three answers of `key-status` (extension/tools/settings.ts KEY_STATUS_TEXT).
const KEY_ENV = 'Using FAL_KEY from the environment.';
const KEY_STORED = 'Using a key stored in the Design Library settings.';
const KEY_MISSING = 'No provider key — generation will fail until one is set.';

export const designLibrarySettingsProbe: ToolProbe = {
  tool: TOOL,
  steps: [
    {
      action: 'read',
      setup: async (ctx) => { ctx.state.original = await settings(ctx); },
      params: { action: 'read' },
      expect(result) {
        for (const line of ['Librarian model:', 'Design model:', 'Default variants:', 'Revision behaviour:', 'Prompt recipes:', 'Media calls per run:', 'Index repair:']) {
          expectText(result, line);
        }
        expectText(result, 'Media model (text-to-image):');
      },
    },
    {
      action: 'set-model',
      params: { action: 'set-model', role: 'librarian', providerId: 'stub-alibaba', modelId: 'stub-model' },
      async expect(result, ctx) {
        expectText(result, 'The librarian model is now stub-alibaba/stub-model.');
        await read(ctx, 'the Librarian model', (text) => text.includes('Librarian model: stub-alibaba/stub-model'));
      },
    },
    {
      // With no provider or model the setting follows the app's configured model again.
      action: 'set-model',
      params: { action: 'set-model', role: 'librarian' },
      async expect(result, ctx) {
        expectText(result, "The librarian model now follows Sero's configured model.");
        await read(ctx, 'the Librarian model to follow the app', (text) => text.includes("Librarian model: Sero's configured model"));
      },
    },
    {
      action: 'set-generation',
      params: { action: 'set-generation', variantCount: 2, revisionBehaviour: 'retain' },
      async expect(result, ctx) {
        expectText(result, 'Defaults updated: 2 variants, retain on revise.');
        await read(ctx, 'the generation defaults', (text) => text.includes('Default variants: 2') && text.includes('Revision behaviour: retain'));
      },
    },
    {
      action: 'save-recipe',
      params: { action: 'save-recipe', name: 'Probe recipe', instruction: 'Prefer calm, spacious layouts.' },
      async expect(result, ctx) {
        expectText(result, 'Saved recipe "Probe recipe".');
        await read(ctx, 'the recipe in the list', (text) => /Prompt recipes: .*Probe recipe/.test(text));
        const recipe = (await settings(ctx)).generation.recipes.find((entry) => entry.name === 'Probe recipe');
        if (!recipe) throw new Error('the saved recipe is not in the settings');
        ctx.state.recipeId = recipe.id;
      },
    },
    {
      action: 'delete-recipe',
      params: (ctx) => ({ action: 'delete-recipe', recipeId: saved<string>(ctx, 'recipeId') }),
      async expect(result, ctx) {
        expectText(result, 'Recipe deleted.');
        await poll(ctx, 'the recipe to be gone', async () => !(await settings(ctx)).generation.recipes.some((entry) => entry.id === ctx.state.recipeId));
      },
    },
    {
      action: 'set-layout',
      params: { action: 'set-layout', inspectorWidth: 400, sessionsRailCollapsed: true },
      async expect(result, ctx) {
        expectText(result, 'Layout saved.');
        await poll(ctx, 'the layout', async () => {
          const { layout } = await settings(ctx);
          return layout.inspectorWidth === 400 && layout.sessionsRailCollapsed === true;
        });
      },
    },
    {
      // The saved view is not part of `read`; it lives in the plugin's state file.
      action: 'set-view',
      params: { action: 'set-view', view: { query: 'probe-view' } },
      async expect(result, ctx) {
        expectText(result, 'View preferences saved.');
        await poll(ctx, 'the saved view', async () => (await readStateFile(ctx)).view?.query === 'probe-view');
      },
    },
    {
      action: 'set-media-model',
      params: { action: 'set-media-model', capability: 'text-to-image', mediaModel: 'fal-ai/flux/dev' },
      async expect(result, ctx) {
        expectText(result, 'text-to-image now uses fal-ai/flux/dev.');
        await read(ctx, 'the media model', (text) => text.includes('Media model (text-to-image): fal-ai/flux/dev'));
      },
    },
    {
      action: 'set-media-model',
      params: { action: 'set-media-model', capability: 'text-to-image' },
      async expect(result, ctx) {
        expectText(result, "text-to-image now uses the adapter's default model.");
        await read(ctx, 'the default media model', (text) => text.includes("Media model (text-to-image): the adapter's default"));
      },
    },
    {
      // fal.ai's public model list: an anonymous GET with no key and no charge (extension/fal-media-model-catalog.ts), so it needs the network but no account.
      action: 'list-media-models',
      params: { action: 'list-media-models' },
      expect: (result) => expectText(result, 'Media models loaded.'),
    },
    {
      action: 'set-media-cap',
      params: { action: 'set-media-cap', callsPerRun: 2 },
      async expect(result, ctx) {
        expectText(result, 'A generation run may now make 2 media call(s).');
        await read(ctx, 'the media cap', (text) => text.includes('Media calls per run: 2'));
      },
    },
    {
      action: 'set-media-cap',
      params: (ctx) => ({ action: 'set-media-cap', callsPerRun: (saved<SettingsView>(ctx, 'original')).media.callsPerRun }),
      async expect(result, ctx) {
        expectText(result, 'A generation run may now make');
        const original = saved<SettingsView>(ctx, 'original').media.callsPerRun;
        await read(ctx, 'the original media cap', (text) => text.includes(`Media calls per run: ${original}`));
      },
    },
    {
      // Where the key comes from decides what the next steps must show: a FAL_KEY in the environment wins over a stored key.
      action: 'key-status',
      params: { action: 'key-status' },
      expect(result, ctx) {
        const text = result.text.trim();
        if (text !== KEY_ENV && text !== KEY_MISSING) throw new Error(`expected no stored key before the probe stores one: ${result.text}`);
        ctx.state.fromEnv = text === KEY_ENV;
      },
    },
    {
      action: 'store-key',
      params: { action: 'store-key', key: 'tool-check-dummy-key' },
      async expect(result, ctx) {
        expectText(result, ctx.state.fromEnv
          ? 'Saved, but FAL_KEY in the environment takes precedence and is what will be used.'
          : 'Saved to the Design Library settings, readable only by you.');
        const file = await secretsFile(ctx);
        const stored = readJsonFile(file) as { falKey?: string } | null;
        if (stored?.falKey !== 'tool-check-dummy-key') throw new Error('secrets.json does not hold the stored key');
        if (process.platform !== 'win32' && (fs.statSync(file).mode & 0o777) !== 0o600) throw new Error('secrets.json is readable by others');
        // The key never comes back from a read.
        const answer = await invoke(ctx, TOOL, { action: 'read' });
        if (JSON.stringify(answer).includes('tool-check-dummy-key')) throw new Error('a read returned the key');
      },
    },
    {
      action: 'key-status',
      params: { action: 'key-status' },
      expect: (result, ctx) => expectText(result, ctx.state.fromEnv ? KEY_ENV : KEY_STORED),
    },
    {
      action: 'clear-key',
      params: { action: 'clear-key' },
      async expect(result, ctx) {
        expectText(result, ctx.state.fromEnv ? KEY_ENV : KEY_MISSING);
        if (fs.existsSync(await secretsFile(ctx))) throw new Error('secrets.json is still on disk');
      },
    },
    {
      // Scheduled for the next launch: the marker file is written and `read` reports it.
      action: 'repair-indexes',
      params: { action: 'repair-indexes' },
      async expect(result, ctx) {
        expectText(result, 'A full index repair is scheduled for the next Sero restart.');
        if (!fs.existsSync(path.join(await libraryHome(ctx), '.repair-indexes.json'))) throw new Error('no repair marker was written');
        await read(ctx, 'the repair to show as scheduled', (text) => text.includes('Index repair: scheduled'));
      },
    },
  ],
};
