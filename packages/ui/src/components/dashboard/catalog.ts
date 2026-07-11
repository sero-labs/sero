// Dashboard component catalogue — type for the JSON source of truth.
//
// The catalogue data lives in `catalog.json` (plain data, no compiler needed)
// and ships as `@sero-ai/ui/dashboard-catalog.json`. Tooling and the agent read
// that file directly; this module only provides the entry type so TypeScript
// callers can type the parsed JSON.
//
// Keep `catalog.json` in step with the two readable views on release:
//   - packages/templates/skills/sero-dashboard-ui/references/component-catalog.md
//   - the docs-site dashboard component catalogue page
// (Generation + drift validation is a deferred follow-up.)

export interface DashboardComponentCatalogEntry {
  name: string;
  category:
    | "layout"
    | "typography"
    | "data-display"
    | "state"
    | "action"
    | "filter";
  /** `primitive` = existing @sero-ai/ui primitive; `composite` = new dashboard component. */
  kind: "primitive" | "composite";
  summary: string;
  useWhen: string;
  related?: string[];
  status: "stable" | "experimental";
  example?: string;
}
