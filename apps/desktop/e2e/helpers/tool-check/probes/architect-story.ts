/**
 * The Architect story, in order: one line of events between the user's chat
 * (`architect_projects`) and the project owners' sessions (`architect`). Every
 * step carries its place in the line (architect-gate.ts), so the two tools'
 * probes together are one run, and the pair runner starts both sessions.
 */
import { sequenced, type StoryEntry } from './architect-gate';
import { charterStory } from './architect-story-charter';
import { finishStory } from './architect-story-finish';
import { ownStory } from './architect-story-own';
import { roomStory } from './architect-story-room';
import { setupStory } from './architect-story-setup';
import { workStory } from './architect-story-work';
import type { ScenarioStep } from '../types';

export const STORY: StoryEntry[] = [...charterStory, ...setupStory, ...workStory, ...roomStory, ...ownStory, ...finishStory];

export interface PlacedStep {
  entry: StoryEntry;
  step: ScenarioStep;
}

/** Each step wrapped to wait for its turn. */
export const PLACED: PlacedStep[] = STORY.map((entry, index) => ({ entry, step: sequenced(entry, index) }));

export const stepsOf = (actor: StoryEntry['actor'], project?: StoryEntry['project']): ScenarioStep[] =>
  PLACED.filter((placed) => placed.entry.actor === actor && (project === undefined || placed.entry.project === project)).map((placed) => placed.step);
