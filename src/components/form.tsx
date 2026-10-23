import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

type IconProps = { className?: string };

/**
 * Standard form section card: icon + title + optional description, then body.
 */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  footer,
  compact,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<IconProps>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className={cn(compact && "pb-3")}>
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </CardHeader>
      <CardContent className={cn("space-y-5", compact && "pt-0")}>{children}</CardContent>
      {footer && (
        <div className="border-t bg-muted/30 px-6 py-3 flex items-center justify-end gap-2 flex-wrap">
          {footer}
        </div>
      )}
    </Card>
  );
}

/** Consistent responsive form grid. Default: 1 col mobile → 2 col sm → 3 col lg. */
export function FormGrid({
  cols = 3,
  className,
  children,
}: {
  cols?: 1 | 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  // Capped at 2 columns regardless of `cols` — a 3rd/4th column only ever
  // fit comfortably on very wide viewports, and on anything narrower the
  // extra lg: tier squeezed fields down to the point labels wrapped and
  // inputs went ragged. Two columns always gets each field real width.
  const colsClass = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2",
    4: "sm:grid-cols-2",
  }[cols];
  return <div className={cn("grid gap-4", colsClass, className)}>{children}</div>;
}

/** Standard form field: label + control + optional hint. Full column by default. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  span,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  span?: 1 | 2 | 3 | "full";
  children: React.ReactNode;
}) {
  const spanClass =
    span === "full"
      ? "sm:col-span-2 lg:col-span-full"
      : span === 2
        ? "sm:col-span-2"
        : span === 3
          ? "sm:col-span-2 lg:col-span-3"
          : undefined;
  return (
    <div className={cn("space-y-1.5", spanClass)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground leading-snug">{hint}</p>
      )}
      {error && <p className="text-xs text-destructive leading-snug">{error}</p>}
    </div>
  );
}

/**
 * A row at the bottom of a form card for the submit button (and any secondary actions).
 * Right-aligns on desktop, full-width on mobile.
 */
export function FormActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
