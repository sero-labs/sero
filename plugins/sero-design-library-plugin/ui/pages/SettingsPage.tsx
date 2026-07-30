import { Button, Input, Label, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@sero-ai/ui';
import { useAppTools, useAvailableModels } from '@sero-ai/app-runtime';
import { AvailableModelPicker } from '@sero-ai/ui/model-selection/available-model-picker';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { ModelSelection, PromptRecipe, RevisionBehaviour } from '../../shared/settings';
import type { DesignLibraryState } from '../../shared/types';
import { MediaSettings } from '../components/MediaSettings';

/**
 * Settings (spec §10).
 *
 * Analysis and generation are different jobs, so they get different models.
 * An empty selection means "use Sero's configured model", which is also what
 * clearing the picker does — there is no separate "default" toggle to keep in
 * sync with the picker's own empty state.
 */

interface SettingsPageProps {
  state: DesignLibraryState;
}

function modelKeyOf(selection: ModelSelection): string {
  return selection.modelId === '' ? '' : `${selection.providerId}:${selection.modelId}`;
}

function parseModelKey(key: string): ModelSelection {
  const separator = key.indexOf(':');
  if (key === '' || separator === -1) return { providerId: '', modelId: '' };
  return { providerId: key.slice(0, separator), modelId: key.slice(separator + 1) };
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border border-b px-6 py-5 last:border-b-0">
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="text-muted-foreground mt-0.5 mb-3 text-sm">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

export function SettingsPage({ state }: SettingsPageProps) {
  const tools = useAppTools();
  const { groups } = useAvailableModels();
  const [draft, setDraft] = useState<PromptRecipe | null>(null);

  const settings = state.settings;

  const setModel = (role: 'librarian' | 'design', key: string) => {
    const selection = parseModelKey(key);
    void tools.run('design_library_settings', { action: 'set-model', role, ...selection });
  };

  const setGeneration = (patch: { variantCount?: number; revisionBehaviour?: RevisionBehaviour }) => {
    void tools.run('design_library_settings', { action: 'set-generation', ...patch });
  };

  const saveRecipe = () => {
    if (!draft || draft.name.trim() === '' || draft.instruction.trim() === '') {
      setDraft(null);
      return;
    }
    void tools.run('design_library_settings', {
      action: 'save-recipe',
      recipeId: draft.id === '' ? undefined : draft.id,
      name: draft.name.trim(),
      instruction: draft.instruction.trim(),
    });
    setDraft(null);
  };

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto max-w-3xl">
        <SettingsSection title="Librarian model">
          <AvailableModelPicker
            groups={groups}
            value={modelKeyOf(settings.librarianModel)}
            onChange={(key) => setModel('librarian', key)}
            allowClear
            placeholder="Use Sero's configured model"
          />
        </SettingsSection>

        <SettingsSection title="Design model">
          <AvailableModelPicker
            groups={groups}
            value={modelKeyOf(settings.designModel)}
            onChange={(key) => setModel('design', key)}
            allowClear
            placeholder="Use Sero's configured model"
          />
        </SettingsSection>

        <MediaSettings media={settings.media} />

        <SettingsSection title="Generation defaults">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="variant-count">Variants per design</Label>
              <Select
                value={String(settings.generation.variantCount)}
                onValueChange={(value) => setGeneration({ variantCount: Number(value) })}
              >
                <SelectTrigger id="variant-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="revision-behaviour">On revise</Label>
              <Select
                value={settings.generation.revisionBehaviour}
                onValueChange={(value) =>
                  setGeneration({ revisionBehaviour: value as RevisionBehaviour })
                }
              >
                <SelectTrigger id="revision-behaviour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Replace what is visible</SelectItem>
                  <SelectItem value="retain">Keep as a separate revision</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Prompt recipes"
          description="Named instruction templates applied on top of a design request."
        >
          <div className="space-y-2">
            {settings.generation.recipes.map((recipe) => (
              <div key={recipe.id} className="border-border flex items-start gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{recipe.name}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm">{recipe.instruction}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(recipe)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Delete ${recipe.name}`}
                  onClick={() =>
                    void tools.run('design_library_settings', {
                      action: 'delete-recipe',
                      recipeId: recipe.id,
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            {draft ? (
              <div className="border-border space-y-2 rounded-md border p-3">
                <Input
                  autoFocus
                  value={draft.name}
                  placeholder="Recipe name"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
                <Textarea
                  rows={3}
                  value={draft.instruction}
                  placeholder="Instruction applied on top of the request"
                  onChange={(event) => setDraft({ ...draft, instruction: event.target.value })}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={saveRecipe}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraft({ id: '', name: '', instruction: '', builtIn: false })}
              >
                <Plus className="size-3.5" />
                New recipe
              </Button>
            )}
          </div>
        </SettingsSection>
      </div>
    </ScrollArea>
  );
}
