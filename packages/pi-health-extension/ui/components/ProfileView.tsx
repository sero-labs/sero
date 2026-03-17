/**
 * Profile view — displays and allows editing of user context and preferences.
 */

import { useCallback } from 'react';
import type { HealthState } from '../../shared/types';
import type { UserContext } from '../../shared/types';
import { useAgentPrompt } from '@sero/app-runtime';

interface ProfileViewProps {
  state: HealthState;
  onUpdateState: (updater: (prev: HealthState) => HealthState) => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

export function ProfileView({ state, onUpdateState }: ProfileViewProps) {
  const prompt = useAgentPrompt();
  const ctx = state.userContext;

  const handleEditWithAgent = useCallback((topic: string) => {
    prompt(`Help me update my ${topic}. Ask me the relevant questions and update my health profile.`);
  }, [prompt]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Profile</h2>
        <button
          onClick={() => handleEditWithAgent('entire health profile')}
          className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          Edit with AI
        </button>
      </div>

      <Section title="Daily Targets">
        <InfoRow label="Phase" value={ctx.currentPhase} />
        <InfoRow label="Calories" value={`${ctx.dailyCalorieTarget} cal`} />
        <InfoRow label="Protein" value={`${ctx.dailyMacros.protein}g`} />
        <InfoRow label="Carbs" value={`${ctx.dailyMacros.carbs}g`} />
        <InfoRow label="Fat" value={`${ctx.dailyMacros.fat}g`} />
        <div className="pt-2">
          <button
            onClick={() => handleEditWithAgent('daily calorie and macro targets')}
            className="text-xs text-primary hover:underline"
          >
            Adjust targets
          </button>
        </div>
      </Section>

      <Section title="Equipment & Capabilities">
        {ctx.equipment.length > 0 ? (
          <TagList label="Available Equipment" items={ctx.equipment} />
        ) : (
          <p className="py-2 text-xs text-muted-foreground/60">No equipment set</p>
        )}
        {ctx.injuries.length > 0 && (
          <TagList label="Current Injuries/Limitations" items={ctx.injuries} />
        )}
        <div className="pt-2">
          <button
            onClick={() => handleEditWithAgent('equipment list and any injuries or limitations')}
            className="text-xs text-primary hover:underline"
          >
            Update equipment
          </button>
        </div>
      </Section>

      <Section title="Dietary Preferences">
        <InfoRow label="Diet Type" value={ctx.preferences.dietType || 'Not set'} />
        <TagList label="Allergies" items={ctx.preferences.allergies} />
        <TagList label="Disliked Foods" items={ctx.preferences.dislikedFoods} />
        <div className="pt-2">
          <button
            onClick={() => handleEditWithAgent('dietary preferences, allergies, and food dislikes')}
            className="text-xs text-primary hover:underline"
          >
            Update preferences
          </button>
        </div>
      </Section>

      <Section title="Status">
        <InfoRow label="Streak" value={`${ctx.streak} days`} />
        <InfoRow label="Level" value={ctx.personalityLevel} />
        {ctx.sleepStatus && <InfoRow label="Sleep" value={ctx.sleepStatus} />}
      </Section>

      {/* Inventory summary */}
      {state.inventory.length > 0 && (
        <Section title="Pantry / Fridge">
          <div className="flex flex-wrap gap-1.5 py-2">
            {state.inventory.slice(0, 20).map((item) => (
              <span
                key={item.id}
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {item.name}{item.quantity ? ` (${item.quantity})` : ''}
              </span>
            ))}
            {state.inventory.length > 20 && (
              <span className="text-xs text-muted-foreground/60">
                +{state.inventory.length - 20} more
              </span>
            )}
          </div>
          <div className="pt-1">
            <button
              onClick={() => handleEditWithAgent('pantry and fridge inventory')}
              className="text-xs text-primary hover:underline"
            >
              Manage inventory
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
