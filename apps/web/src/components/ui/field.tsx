"use client";

import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Vertical shadcn field composition, using the project's existing Label and cn.
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex w-full flex-col gap-5", className)}
      {...props}
    />
  );
}

export function Field({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn(
        "group/field flex w-full flex-col gap-2 data-[invalid=true]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn("group-data-[disabled=true]/field:opacity-50", className)}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-sm leading-normal text-muted-foreground", className)}
      {...props}
    />
  );
}

export function FieldError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  );
}
