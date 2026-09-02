"use client";

import { useQuery } from "@tanstack/react-query";
import { Clipboard, Download, History } from "lucide-react";
import { useState } from "react";

import { ErrorAlert, PageHeader, ms } from "@/components/lab-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { copyJson, downloadJson, getJson } from "@/lib/api";
import { useCopy } from "@/lib/store";
import { cn } from "@/lib/utils";

type Experiment = {
  id: string;
  experiment_type: string;
  parameters: Record<string, unknown>;
  seed: number | null;
  engine: string;
  results: Record<string, unknown>;
  runtime_ms: number;
  timestamp: string;
};

export default function Experiments() {
  const zh = useCopy(false, true);
  const [selected, setSelected] = useState<Experiment | null>(null);
  const history = useQuery({
    queryKey: ["experiments"],
    queryFn: () => getJson<{ experiments: Experiment[] }>("/experiments"),
  });
  const current = selected ?? history.data?.experiments[0];
  return (
    <div>
      <PageHeader
        eyebrow="Reproducibility ledger"
        title={zh ? "实验历史" : "Experiment history"}
        description={
          zh
            ? "每次实验保存参数、种子、引擎、运行时间和真实结果，便于复现与审查。"
            : "Each run stores parameters, seed, engine, runtime, and real results for reproduction and review."
        }
        badge="LOCAL SQLITE"
      />
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{zh ? "最近实验" : "Recent experiments"}</CardTitle>
            <CardDescription>
              {history.data
                ? `${history.data.experiments.length} records`
                : "Loading local ledger…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-[720px] flex-col gap-2 overflow-y-auto">
            {history.isLoading ? (
              Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))
            ) : history.data?.experiments.length ? (
              history.data.experiments.map((experiment) => (
                <button
                  key={experiment.id}
                  type="button"
                  onClick={() => setSelected(experiment)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring",
                    current?.id === experiment.id &&
                      "border-primary bg-primary/5",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {experiment.experiment_type.replaceAll("_", " ")}
                    </span>
                    <Badge variant="secondary">{experiment.engine}</Badge>
                  </span>
                  <span className="font-data mt-2 block text-[10px] text-muted-foreground">
                    {new Date(experiment.timestamp).toLocaleString()} ·{" "}
                    {ms(experiment.runtime_ms)}
                  </span>
                </button>
              ))
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <History />
                <p className="text-sm">
                  {zh
                    ? "运行任意实验后，记录会出现在这里。"
                    : "Run any experiment and its record will appear here."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {current
                ? current.experiment_type.replaceAll("_", " ")
                : zh
                  ? "选择实验"
                  : "Select an experiment"}
            </CardTitle>
            <CardDescription>
              {current
                ? `ID ${current.id} · seed ${current.seed ?? "deterministic"}`
                : zh
                  ? "查看完整可复现 JSON。"
                  : "Inspect complete reproducible JSON."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {current ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => copyJson(current)}>
                    <Clipboard data-icon="inline-start" />
                    Copy experiment JSON
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadJson(`pokerlab-${current.id}.json`, current)
                    }
                  >
                    <Download data-icon="inline-start" />
                    Download JSON
                  </Button>
                </div>
                <pre className="font-data max-h-[600px] overflow-auto rounded-xl border bg-background p-4 text-[11px] leading-5 text-muted-foreground">
                  {JSON.stringify(current, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="flex h-96 items-center justify-center text-muted-foreground">
                <History />
              </div>
            )}
          </CardContent>
        </Card>
        {history.error ? <ErrorAlert message={history.error.message} /> : null}
      </div>
    </div>
  );
}
