// Glass-scope tests: WidgetContent applies the token scope, and surfaces
// route through the scope-aware `--surface-*` tokens rather than solid ones.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WidgetContent } from "../layout";
import { MetricCard } from "../metric";
import { ItemList, ItemListItem } from "../item-list";

describe("WidgetContent glass scope", () => {
  it("applies the glass class by default", () => {
    const html = renderToStaticMarkup(<WidgetContent />);
    expect(html).toContain("glass");
  });

  it("omits the glass class when glass={false}", () => {
    const html = renderToStaticMarkup(<WidgetContent glass={false} />);
    expect(html).not.toContain(' class="glass');
    expect(html).not.toMatch(/\bglass\b/);
  });
});

describe("surface token routing", () => {
  it("MetricCard reads raised surface + rim tokens, not solid bg-surface", () => {
    const html = renderToStaticMarkup(<MetricCard />);
    expect(html).toContain("--surface-raised");
    expect(html).toContain("--surface-line");
    expect(html).toContain("--surface-rim");
    expect(html).not.toContain("--bg-surface");
  });

  it("ItemListItem reads the flat surface token, not the muted variant", () => {
    const html = renderToStaticMarkup(
      <ItemList>
        <ItemListItem primary="Row" />
      </ItemList>,
    );
    expect(html).toContain("--surface-flat");
    expect(html).not.toContain("bg-muted/50");
  });
});
