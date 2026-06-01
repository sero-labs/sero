import * as React from "react"
import { SearchIcon } from "lucide-react"

import { cn } from "../../lib/utils"

interface SearchInputProps extends React.ComponentProps<"input"> {
  containerClassName?: string
  endAdornment?: React.ReactNode
  iconClassName?: string
  ref?: React.Ref<HTMLInputElement>
}

function SearchInput({ containerClassName, className, endAdornment, iconClassName, placeholder, "aria-label": ariaLabel, ref, ...props }: SearchInputProps) {
  return (
    <div
      data-slot="search-input"
      className={cn("flex items-center gap-2 px-3", containerClassName)}
    >
      <SearchIcon
        data-slot="search-input-icon"
        className={cn("text-muted-foreground size-3.5 shrink-0", iconClassName)}
      />
      <input
        aria-label={ariaLabel ?? (typeof placeholder === "string" ? placeholder : "Search")}
        placeholder={placeholder}
        ref={ref}
        data-slot="search-input-control"
        className={cn(
          "placeholder:text-muted-foreground h-9 w-full min-w-0 bg-transparent pl-1.5 text-xs text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      {endAdornment}
    </div>
  )
}

export { SearchInput }
