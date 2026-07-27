import { randomUUID } from 'node:crypto';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { DesignLibraryPaths } from '../../shared/paths';
import type { DesignLibrarySettings, PromptRecipe } from '../../shared/settings';
import { appendRequest, readState } from '../../shared/state-io';
import type { ViewPatch } from '../../shared/types';
import { failure, text, type ToolResult } from './result';

/**
 * The settings surface. Everything here persists to plugin state (spec §10).
 *
 * Model selections are provider + model pairs, and an empty pair means "use
 * Sero's configured model" — the same default the model picker shows.
 */

const ACTIONS = [
  'read',
  'set-model',
  'set-generation',
  'save-recipe',
  'delete-recipe',
  'set-layout',
  'set-view',
] as const;

const MODEL_ROLES = ['librarian', 'design'] as const;

function renderSettings(settings: DesignLibrarySettings): ToolResult {
  const model = (selection: { providerId: string; modelId: string }) =>
    selection.modelId === '' ? "Sero's configured model" : `${selection.providerId}/${selection.modelId}`;
  const lines = [
    `Librarian model: ${model(settings.librarianModel)}`,
    `Design model: ${model(settings.designModel)}`,
    `Default variants: ${settings.generation.variantCount}`,
    `Revision behaviour: ${settings.generation.revisionBehaviour}`,
    `Prompt recipes: ${settings.generation.recipes.map((recipe) => recipe.name).join(', ') || 'none'}`,
  ];
  return text(lines.join('\n'), { settings });
}

export function registerSettingsTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_settings',
    label: 'Design Library Settings',
    description: 'Read and update Design Library settings: model choices, generation defaults and prompt recipes.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: 'Which settings operation to perform' }),
      role: Type.Optional(StringEnum(MODEL_ROLES, { description: 'Which model to set' })),
      providerId: Type.Optional(Type.String({ description: 'Empty to fall back to Sero\'s configured model' })),
      modelId: Type.Optional(Type.String()),
      variantCount: Type.Optional(Type.Number({ description: '1–5' })),
      revisionBehaviour: Type.Optional(StringEnum(['replace', 'retain'] as const)),
      recipeId: Type.Optional(Type.String({ description: 'Omit on save to create a new recipe' })),
      name: Type.Optional(Type.String()),
      instruction: Type.Optional(Type.String()),
      inspectorWidth: Type.Optional(Type.Number()),
      sessionsRailCollapsed: Type.Optional(Type.Boolean()),
      view: Type.Optional(
        Type.Unknown({ description: 'Partial view preferences: scope, query, filters, sort, selectedItemId' }),
      ),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      const state = await readState(paths);
      const settings = state.settings;

      switch (params.action) {
        case 'read':
          return renderSettings(settings);

        case 'set-model': {
          if (!params.role) return failure('`set-model` needs role: librarian or design.');
          const selection = { providerId: params.providerId ?? '', modelId: params.modelId ?? '' };
          await appendRequest(paths, {
            kind: 'settings.update',
            patch: params.role === 'librarian' ? { librarianModel: selection } : { designModel: selection },
          });
          return text(
            selection.modelId === ''
              ? `The ${params.role} model now follows Sero's configured model.`
              : `The ${params.role} model is now ${selection.providerId}/${selection.modelId}.`,
          );
        }

        case 'set-generation': {
          const variantCount = params.variantCount ?? settings.generation.variantCount;
          if (variantCount < 1 || variantCount > 5) return failure('variantCount must be 1–5.');
          await appendRequest(paths, {
            kind: 'settings.update',
            patch: {
              generation: {
                ...settings.generation,
                variantCount,
                revisionBehaviour: params.revisionBehaviour ?? settings.generation.revisionBehaviour,
              },
            },
          });
          return text(`Defaults updated: ${variantCount} variants, ${params.revisionBehaviour ?? settings.generation.revisionBehaviour} on revise.`);
        }

        case 'save-recipe': {
          if (!params.name || !params.instruction) {
            return failure('`save-recipe` needs name and instruction.');
          }
          const id = params.recipeId ?? randomUUID();
          const recipe: PromptRecipe = {
            id,
            name: params.name,
            instruction: params.instruction,
            // Editing a built-in makes it yours; the original stays available
            // to anyone who has not edited it.
            builtIn: false,
          };
          const recipes = settings.generation.recipes.some((entry) => entry.id === id)
            ? settings.generation.recipes.map((entry) => (entry.id === id ? recipe : entry))
            : [...settings.generation.recipes, recipe];
          await appendRequest(paths, {
            kind: 'settings.update',
            patch: { generation: { ...settings.generation, recipes } },
          });
          return text(`Saved recipe "${params.name}".`, { recipeId: id });
        }

        case 'delete-recipe': {
          if (!params.recipeId) return failure('`delete-recipe` needs recipeId.');
          await appendRequest(paths, {
            kind: 'settings.update',
            patch: {
              generation: {
                ...settings.generation,
                recipes: settings.generation.recipes.filter((entry) => entry.id !== params.recipeId),
              },
            },
          });
          return text('Recipe deleted.');
        }

        case 'set-layout': {
          await appendRequest(paths, {
            kind: 'settings.update',
            patch: {
              layout: {
                inspectorWidth: params.inspectorWidth ?? settings.layout.inspectorWidth,
                sessionsRailCollapsed:
                  params.sessionsRailCollapsed ?? settings.layout.sessionsRailCollapsed,
              },
            },
          });
          return text('Layout saved.');
        }

        case 'set-view': {
          if (typeof params.view !== 'object' || params.view === null) {
            return failure('`set-view` needs a view object.');
          }
          // Whatever arrives is normalised on the next state read, so an
          // unknown key cannot corrupt the stored preferences.
          await appendRequest(paths, {
            kind: 'view.set',
            patch: params.view as ViewPatch,
          });
          return text('View preferences saved.');
        }
      }
    },
  });
}
