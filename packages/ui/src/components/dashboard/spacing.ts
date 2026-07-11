// Shared semantic spacing scale for dashboard layout components.
//
// One scale keeps gaps consistent across Stack, Inline, Grid and Section so
// widgets do not drift into ad-hoc `gap-[7px]` values.

export type Gap = "none" | "xs" | "sm" | "md" | "lg";

export const gapClass: Record<Gap, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
};
