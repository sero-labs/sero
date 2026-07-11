// IconButton — a small icon-only button built on the Button primitive.
//
// Widget-appropriate sizing with a required accessible label, since an
// icon-only control carries no text for assistive tech.

import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "./typography";

const sizeMap = {
  xs: "icon-xs",
  sm: "icon-sm",
  md: "icon",
} as const;

const iconSizeMap = {
  xs: "xs",
  sm: "sm",
  md: "md",
} as const;

export interface IconButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "size" | "children"> {
  /** The icon component to render (e.g. a lucide-react icon). */
  icon: React.ComponentType<{ className?: string }>;
  /** Required accessible label — the control has no visible text. */
  label: string;
  size?: keyof typeof sizeMap;
}

/** A compact icon-only button with a required accessible label. */
function IconButton({
  className,
  icon,
  label,
  size = "sm",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      data-slot="icon-button"
      type="button"
      variant={variant}
      size={sizeMap[size]}
      aria-label={label}
      title={label}
      className={cn("text-[var(--text-muted)]", className)}
      {...props}
    >
      <Icon icon={icon} size={iconSizeMap[size]} className="text-current" />
    </Button>
  );
}

export { IconButton };
