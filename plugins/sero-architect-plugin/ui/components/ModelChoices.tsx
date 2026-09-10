import type { ProjectRecord } from '../../shared/record';

/** Available choices are explicit before the planner assigns individual steps. */
export function ModelChoices({ record }: { record: ProjectRecord }) {
  return (
    <details open className="ar-models">
      <summary>Models for this plan</summary>
      <p>Owner, research and capture: {record.session.model ?? 'Admin MED'} · {record.session.thinking ?? 'not selected'} thinking</p>
      <p>Workflow steps and Room members use these Admin selections. Their assignments appear in the Workflow or Room when planning finishes.</p>
      {record.modelTiers ? <ul>{Object.entries(record.modelTiers).map(([tier, model]) => (
        <li key={tier}>{tier}: {model.provider}/{model.modelId} · {model.thinkingLevel ?? 'medium'} thinking</li>
      ))}</ul> : <p>Model selections have not been loaded. Resume the project to load the current Admin settings.</p>}
    </details>
  );
}
