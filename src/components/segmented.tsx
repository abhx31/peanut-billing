"use client";

import * as React from "react";
import { cn } from "cn";

type Option<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
};

type Props<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  ariaLabel?: string;
};

/**
 * A compact segmented control for binary / 3-way choices. Styled to match
 * shadcn/Base UI, no vendor dependency.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  size = "default",
  className,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-md border bg-muted/40 p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "text-xs px-2.5 py-1" : "text-sm px-3 py-1.5",
              active
                ? "bg-background text-foreground font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
