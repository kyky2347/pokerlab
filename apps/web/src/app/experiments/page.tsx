"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  History,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader, ms } from "@/components/lab-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadJsonText, getJson, getText } from "@/lib/api";
import {
  databaseLabel,
  experimentName,
  type ExperimentPage,
  type ExperimentSummary,
} from "@/lib/experiments";
import { useCopy } from "@/lib/store";
import { cn } from "@/lib/utils";

function RetryNotice({
  zh,
  detail = false,
  pending,
  retry,
}: {
  zh: boolean;
  detail?: boolean;
  pending: boolean;
  retry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>
        {detail
          ? zh
            ? "实验详情加载失败"
            : "Could not load this experiment"
          : zh
            ? "实验历史加载失败"
            : "Could not load experiment history"}
      </AlertTitle>
      <AlertDescription>
        <p>
          {zh
            ? "请检查网络连接与 API 状态，然后重试。已有记录未被修改。"
            : "Check your connection and the API, then retry. Saved records have not been changed."}
        </p>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={retry}
        >
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          {pending ? (zh ? "正在重试…" : "Retrying…") : zh ? "重试" : "Retry"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ExperimentDetail({
  experiment,
  zh,
}: {
  experiment: ExperimentSummary;
  zh: boolean;
}) {
  const [copyState, setCopyState] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const detail = useQuery({
    queryKey: ["experiment-export", experiment.id],
    queryFn: ({ signal }) =>
      getText(
        `/experiments/${encodeURIComponent(experiment.id)}/export`,
        signal,
      ),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    networkMode: "always",
  });
  async function copy() {
    if (!detail.data) return;
    setCopyState("pending");
    try {
      await navigator.clipboard.writeText(detail.data);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }
  return (
    <Card className="min-w-0" aria-busy={detail.isFetching}>
      <CardHeader>
        <CardTitle>{experimentName(experiment.experiment_type, zh)}</CardTitle>
        <CardDescription className="break-words">
          ID {experiment.id} ·{" "}
          <span className="inline-block">
            {zh ? "种子" : "Seed"}{" "}
            {experiment.seed ?? (zh ? "确定性实验" : "deterministic")}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {detail.isError ? (
          <RetryNotice
            zh={zh}
            detail
            pending={detail.isFetching}
            retry={() => void detail.refetch()}
          />
        ) : detail.isPending ? (
          <div role="status" className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {zh ? "正在加载完整记录…" : "Loading the complete record…"}
            </p>
            <Skeleton className="h-80 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={copyState === "pending"}
                onClick={() => void copy()}
              >
                <Clipboard data-icon="inline-start" aria-hidden="true" />
                {copyState === "pending"
                  ? zh
                    ? "正在复制…"
                    : "Copying…"
                  : zh
                    ? "复制实验 JSON"
                    : "Copy experiment JSON"}
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() =>
                  downloadJsonText(
                    `pokerlab-${experiment.id}.json`,
                    detail.data,
                  )
                }
              >
                <Download data-icon="inline-start" aria-hidden="true" />
                {zh ? "下载 JSON" : "Download JSON"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {zh
                ? "原始 JSON 保留完整整数种子；复制和下载不会经浏览器数字转换。"
                : "Original JSON preserves full integer seeds; copying and downloading do not convert numbers in the browser."}
            </p>
            {copyState === "success" ? (
              <p role="status" className="text-sm text-muted-foreground">
                {zh ? "完整 JSON 已复制。" : "Complete JSON copied."}
              </p>
            ) : null}
            {copyState === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>
                  {zh ? "无法访问剪贴板" : "Clipboard unavailable"}
                </AlertTitle>
                <AlertDescription>
                  {zh
                    ? "请允许浏览器访问剪贴板后重试，或使用“下载 JSON”。"
                    : "Allow clipboard access and retry, or use Download JSON."}
                </AlertDescription>
              </Alert>
            ) : null}
            <pre
              tabIndex={0}
              aria-label={zh ? "完整实验 JSON" : "Complete experiment JSON"}
              className="font-data max-h-[600px] overflow-auto rounded-xl border bg-background p-4 text-xs leading-5 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {detail.data}
            </pre>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Experiments() {
  const zh = useCopy(false, true);
  const queryClient = useQueryClient();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cursor = cursors.at(-1);
  const history = useQuery({
    queryKey: ["experiments", "page", cursor],
    queryFn: ({ signal }) =>
      getJson<ExperimentPage>(
        `/experiments/page?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        signal,
      ),
    retry: false,
    networkMode: "always",
  });
  const records = history.data?.experiments ?? [];
  const current =
    records.find((experiment) => experiment.id === selectedId) ?? records[0];

  function refresh() {
    setSelectedId(null);
    if (cursors.length === 1) void history.refetch();
    else {
      void queryClient.invalidateQueries({
        queryKey: ["experiments", "page", null],
        exact: true,
      });
      setCursors([null]);
    }
  }

  return (
    <div>
      <PageHeader
        title={zh ? "实验历史" : "Experiment history"}
        description={
          zh
            ? "按页浏览实验摘要，按需查看完整记录。参数、种子、引擎与真实结果均保留，便于复现与审查。"
            : "Browse lightweight summaries, then open a complete record on demand. Parameters, seed, engine, and real results remain available for reproduction and review."
        }
        badge={databaseLabel(
          history.isError ? undefined : history.data?.database,
          zh,
        )}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="min-w-0" aria-busy={history.isFetching}>
          <CardHeader>
            <CardTitle>{zh ? "已保存实验" : "Saved experiments"}</CardTitle>
            <CardDescription role="status">
              {history.isError
                ? zh
                  ? "暂时无法更新记录"
                  : "Records could not be updated"
                : history.isFetching
                  ? zh
                    ? "正在加载实验摘要…"
                    : "Loading experiment summaries…"
                  : zh
                    ? `第 ${cursors.length} 页 · 本页 ${records.length} 条`
                    : `Page ${cursors.length} · ${records.length} ${records.length === 1 ? "record" : "records"} on this page`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {history.isError ? (
              <RetryNotice
                zh={zh}
                pending={history.isFetching}
                retry={() => void history.refetch()}
              />
            ) : null}
            {history.isPending ? (
              Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))
            ) : records.length ? (
              <ul
                aria-label={zh ? "实验记录" : "Experiment records"}
                className="flex max-h-96 flex-col gap-2 overflow-y-auto lg:max-h-[36rem]"
              >
                {records.map((experiment) => (
                  <li key={experiment.id}>
                    <button
                      type="button"
                      aria-current={
                        current?.id === experiment.id ? "true" : undefined
                      }
                      onClick={() => setSelectedId(experiment.id)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring",
                        current?.id === experiment.id &&
                          "border-primary bg-primary/5",
                      )}
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 text-sm font-medium break-words">
                          {experimentName(experiment.experiment_type, zh)}
                        </span>{" "}
                        <Badge variant="secondary">{experiment.engine}</Badge>
                      </span>
                      <span className="font-data mt-2 block text-xs text-muted-foreground">
                        {new Date(experiment.timestamp).toLocaleString(
                          zh ? "zh-CN" : "en-US",
                        )}{" "}
                        · {ms(experiment.runtime_ms)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !history.isError ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <History aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {zh ? "本页没有实验记录" : "No experiments on this page"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {zh
                      ? "运行一次计算即可保存记录，也可以刷新查看最新实验。"
                      : "Run a calculation to save a record, or refresh to check for recent experiments."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Link
                    href="/equity"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "min-h-11",
                    )}
                  >
                    {zh ? "打开胜率实验室" : "Open Equity Lab"}
                  </Link>
                </EmptyContent>
              </Empty>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <nav
              aria-label={zh ? "实验历史分页" : "Experiment history pages"}
              className="flex justify-between gap-2"
            >
              <Button
                variant="outline"
                className="min-h-11"
                disabled={cursors.length === 1 || history.isFetching}
                onClick={() => {
                  setSelectedId(null);
                  setCursors((previous) => previous.slice(0, -1));
                }}
              >
                <ChevronLeft data-icon="inline-start" aria-hidden="true" />
                {zh ? "上一页" : "Previous"}
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={
                  !history.data?.next_cursor ||
                  history.isFetching ||
                  history.isError
                }
                onClick={() => {
                  if (history.data?.next_cursor) {
                    setSelectedId(null);
                    setCursors((previous) => [
                      ...previous,
                      history.data.next_cursor,
                    ]);
                  }
                }}
              >
                {zh ? "下一页" : "Next"}
                <ChevronRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            </nav>
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={history.isFetching}
              onClick={refresh}
            >
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
              {zh ? "刷新最新记录" : "Refresh latest records"}
            </Button>
          </CardFooter>
        </Card>
        {current ? (
          <ExperimentDetail key={current.id} experiment={current} zh={zh} />
        ) : (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>
                {zh ? "完整实验记录" : "Complete experiment record"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "选中记录后，在这里查看和导出原始 JSON。"
                  : "Select a record to inspect and export its original JSON here."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Empty className="min-h-48">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <History aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {history.isPending
                      ? zh
                        ? "正在读取台账…"
                        : "Reading the ledger…"
                      : zh
                        ? "尚未选择记录"
                        : "No record selected"}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
