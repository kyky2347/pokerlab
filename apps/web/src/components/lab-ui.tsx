"use client";

import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <header className="mb-7 grid gap-4 border-b pb-7 md:grid-cols-[1fr_auto] md:items-end">
      <div className="max-w-3xl">
        <p className="font-data mb-3 text-[11px] tracking-[0.16em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display text-4xl leading-none tracking-[-0.035em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>
      {badge ? <Badge variant="outline">{badge}</Badge> : null}
    </header>
  );
}

export function Metric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: "success" | "danger" | "primary";
}) {
  return (
    <div className="min-w-0">
      <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-data mt-1 truncate text-2xl tracking-[-0.05em] sm:text-3xl",
          accent === "success" && "text-success",
          accent === "danger" && "text-destructive",
          accent === "primary" && "text-primary",
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

export function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Calculation stopped / 计算已停止</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
export function LoadingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LoaderCircle className="animate-spin" aria-hidden="true" />
      {children}
    </span>
  );
}
export function StatusDot({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2
        className={ready ? "text-success" : "text-muted-foreground"}
      />
      {label}
    </span>
  );
}
export const percent = (value: number, digits = 2) =>
  `${(value * 100).toFixed(digits)}%`;
export const ms = (value: number) =>
  value < 1000 ? `${value.toFixed(1)} ms` : `${(value / 1000).toFixed(2)} s`;
