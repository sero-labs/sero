// State-selection + accessibility-contract tests for dashboard components.

import { renderToStaticMarkup } from "react-dom/server";
import { RotateCw, Clock } from "lucide-react";
import { describe, expect, it } from "vitest";

import { DataBoundary } from "../data-boundary";
import { EmptyState } from "../empty-state";
import { IconButton } from "../icon-button";
import { Icon } from "../typography";
import { ProgressRing } from "../progress-ring";
import { Status } from "../status";

describe("DataBoundary", () => {
  const slots = {
    loading: <div>LOADING</div>,
    empty: <div>EMPTY</div>,
    error: <div>ERROR</div>,
    stale: <div>STALE</div>,
    children: <div>READY</div>,
  };

  it("renders only the loading slot when loading", () => {
    const html = renderToStaticMarkup(
      <DataBoundary state="loading" {...slots} />,
    );
    expect(html).toContain("LOADING");
    expect(html).not.toContain("READY");
    expect(html).not.toContain("EMPTY");
  });

  it("renders only the empty slot when empty", () => {
    const html = renderToStaticMarkup(<DataBoundary state="empty" {...slots} />);
    expect(html).toContain("EMPTY");
    expect(html).not.toContain("READY");
  });

  it("renders only the error slot when error", () => {
    const html = renderToStaticMarkup(<DataBoundary state="error" {...slots} />);
    expect(html).toContain("ERROR");
    expect(html).not.toContain("READY");
  });

  it("renders the stale banner above ready content when stale", () => {
    const html = renderToStaticMarkup(<DataBoundary state="stale" {...slots} />);
    expect(html).toContain("STALE");
    expect(html).toContain("READY");
    expect(html.indexOf("STALE")).toBeLessThan(html.indexOf("READY"));
  });

  it("renders ready children when ready", () => {
    const html = renderToStaticMarkup(<DataBoundary state="ready" {...slots} />);
    expect(html).toContain("READY");
    expect(html).not.toContain("STALE");
  });
});

describe("accessibility contracts", () => {
  it("ProgressRing exposes progressbar value semantics", () => {
    const html = renderToStaticMarkup(
      <ProgressRing value={30} max={60} label="Usage" />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Usage"');
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain('aria-valuemax="60"');
    // 30 / 60 = 50%
    expect(html).toContain("50%");
  });

  it("ProgressRing clamps out-of-range values", () => {
    const html = renderToStaticMarkup(<ProgressRing value={999} max={100} />);
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("100%");
  });

  it("Icon is hidden from assistive tech without a label", () => {
    const html = renderToStaticMarkup(<Icon icon={Clock} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it("Icon is exposed as an image with a label", () => {
    const html = renderToStaticMarkup(<Icon icon={Clock} label="Time" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Time"');
  });

  it("IconButton carries its required accessible label", () => {
    const html = renderToStaticMarkup(
      <IconButton icon={RotateCw} label="Refresh" />,
    );
    expect(html).toContain('aria-label="Refresh"');
    expect(html).toContain('type="button"');
  });

  it("a bare Status dot is announced as a status", () => {
    const html = renderToStaticMarkup(<Status tone="success" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-tone="success"');
  });

  it("EmptyState renders its title and message", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Nothing here" message="Add an item to start" />,
    );
    expect(html).toContain("Nothing here");
    expect(html).toContain("Add an item to start");
  });
});
