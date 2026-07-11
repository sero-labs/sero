// Catalogue integrity — keeps the JSON catalogue honest against the exports.

import { describe, expect, it } from "vitest";

import type { DashboardComponentCatalogEntry } from "../catalog";
import catalogJson from "../catalog.json";
import * as dashboard from "../index";

// The JSON is the source of truth. JSON imports widen literal unions to
// `string`, so assert the authored entry shape for the checks below.
const dashboardComponentCatalog = catalogJson as DashboardComponentCatalogEntry[];

// Reused primitives live in other component folders, not the dashboard barrel.
const REUSED_PRIMITIVES = new Set(["Badge", "Alert", "Button", "Skeleton"]);

const names = dashboardComponentCatalog.map((e) => e.name);

describe("dashboard catalogue", () => {
  it("has no duplicate component names", () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it("every composite entry is exported from the dashboard barrel", () => {
    const missing = dashboardComponentCatalog
      .filter((e) => e.kind === "composite")
      .filter((e) => !(e.name in dashboard))
      .map((e) => e.name);
    expect(missing).toEqual([]);
  });

  it("every primitive entry is a known reused primitive", () => {
    const bad = dashboardComponentCatalog
      .filter((e) => e.kind === "primitive")
      .filter((e) => !REUSED_PRIMITIVES.has(e.name))
      .map((e) => e.name);
    expect(bad).toEqual([]);
  });

  it("every related name resolves to a catalogue entry", () => {
    const known = new Set(names);
    const broken: string[] = [];
    for (const entry of dashboardComponentCatalog) {
      for (const rel of entry.related ?? []) {
        if (!known.has(rel)) broken.push(`${entry.name} -> ${rel}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("every composite exported from the barrel appears in the catalogue", () => {
    // The barrel also exports helpers (tone maps, gapClass) and types; only
    // check the React components (PascalCase functions) are catalogued.
    const catalogued = new Set(names);
    const uncatalogued = Object.entries(dashboard)
      .filter(
        ([name, value]) =>
          /^[A-Z]/.test(name) && typeof value === "function" && !catalogued.has(name),
      )
      .map(([name]) => name);
    expect(uncatalogued).toEqual([]);
  });
});
