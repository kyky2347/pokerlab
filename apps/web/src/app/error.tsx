"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <p className="font-data text-xs tracking-[0.18em] text-destructive">
        SAFE FAILURE
      </p>
      <h1 className="font-display text-5xl tracking-[-0.04em]">
        The experiment stopped safely
      </h1>
      <p className="max-w-lg leading-7 text-muted-foreground">
        No result was fabricated. Check the API connection and retry. /
        实验已安全停止，系统没有伪造结果；请检查 API 连接后重试。
      </p>
      <Button onClick={reset}>
        <RotateCcw data-icon="inline-start" />
        Retry / 重试
      </Button>
    </section>
  );
}
