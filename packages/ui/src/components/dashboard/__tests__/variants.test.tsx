// Variant / tone tests for dashboard components.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "../../ui/badge";
import { Grid, Inline, Stack } from "../layout";
import { Metric } from "../metric";
import { Status } from "../status";
import { Text } from "../typography";

describe("Status tones", () => {
  it("renders a tinted pill for a tone", () => {
    const html = renderToStaticMarkup(
      <Status tone="warning" variant="pill">
        Degraded
      </Status>,
    );
    expect(html).toContain("--status-warning-muted");
    expect(html).toContain("Degraded");
    expect(html).toContain('data-tone="warning"');
  });

  it("maps neutral tone to the muted token", () => {
    const html = renderToStaticMarkup(<Status tone="neutral">Idle</Status>);
    expect(html).toContain("--text-muted");
  });
});

describe("Badge semantic tones", () => {
  it.each([
    ["success", "--status-success"],
    ["warning", "--status-warning"],
    ["info", "--status-info"],
  ] as const)("badge %s uses its status token", (variant, token) => {
    const html = renderToStaticMarkup(<Badge variant={variant}>x</Badge>);
    expect(html).toContain(token);
  });
});

describe("Text variants", () => {
  it("numeric variant uses tabular numerals", () => {
    const html = renderToStaticMarkup(<Text variant="numeric">42</Text>);
    expect(html).toContain("tabular-nums");
  });

  it("clamp overrides truncate", () => {
    const html = renderToStaticMarkup(
      <Text truncate clamp={2}>
        long
      </Text>,
    );
    expect(html).toContain("line-clamp-2");
    expect(html).not.toContain("truncate");
  });
});

describe("Metric", () => {
  it("renders label, value and a trend", () => {
    const html = renderToStaticMarkup(
      <Metric
        label="Jobs"
        value={6}
        trend={{ direction: "up", value: "+2", tone: "success" }}
      />,
    );
    expect(html).toContain("Jobs");
    expect(html).toContain("6");
    expect(html).toContain("+2");
    expect(html).toContain("--status-success");
  });
});

describe("layout spacing scale", () => {
  it("Stack maps semantic gap to a utility", () => {
    expect(renderToStaticMarkup(<Stack gap="lg" />)).toContain("gap-4");
  });
  it("Stack fill grows without scrolling; scroll adds overflow", () => {
    const fill = renderToStaticMarkup(<Stack fill />);
    expect(fill).toContain("flex-1");
    expect(fill).not.toContain("overflow-auto");
    expect(renderToStaticMarkup(<Stack scroll />)).toContain("overflow-auto");
  });
  it("Inline wraps when asked", () => {
    expect(renderToStaticMarkup(<Inline wrap />)).toContain("flex-wrap");
  });
  it("Grid with fixed columns uses a column utility", () => {
    expect(renderToStaticMarkup(<Grid columns={3} />)).toContain("grid-cols-3");
  });
  it("Grid auto uses an inline template", () => {
    expect(renderToStaticMarkup(<Grid columns="auto" minColumnWidth={80} />)).toContain(
      "minmax(80px",
    );
  });
});
