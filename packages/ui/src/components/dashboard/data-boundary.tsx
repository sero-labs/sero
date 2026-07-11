// DataBoundary — a presentation boundary for runtime data states.
//
// It selects which content to show for loading / ready / empty / stale / error.
// It is presentation only: it does not fetch data, subscribe to sources or own
// retry behaviour. The plugin passes the current state and the fallback nodes.

import * as React from "react";

export type DataState = "loading" | "ready" | "empty" | "stale" | "error";

export interface DataBoundaryProps {
  state: DataState;
  /** Shown while `state === "loading"`. */
  loading?: React.ReactNode;
  /** Shown while `state === "empty"`. */
  empty?: React.ReactNode;
  /** Shown while `state === "error"`. */
  error?: React.ReactNode;
  /** Banner rendered above children while `state === "stale"`. */
  stale?: React.ReactNode;
  /** Ready content, also shown (below `stale`) while `state === "stale"`. */
  children?: React.ReactNode;
}

/** Selects presentation for the current data state. */
function DataBoundary({
  state,
  loading,
  empty,
  error,
  stale,
  children,
}: DataBoundaryProps) {
  switch (state) {
    case "loading":
      return <>{loading ?? null}</>;
    case "empty":
      return <>{empty ?? null}</>;
    case "error":
      return <>{error ?? null}</>;
    case "stale":
      return (
        <>
          {stale}
          {children}
        </>
      );
    case "ready":
    default:
      return <>{children}</>;
  }
}

export { DataBoundary };
