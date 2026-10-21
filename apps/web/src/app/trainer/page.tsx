"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  Brain,
  LockKeyhole,
  RefreshCw,
  Target,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LoadingLabel, Metric, PageHeader, percent } from "@/components/lab-ui";
import { PokerTable } from "@/components/poker-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";

type Question = {
  id: string;
  hero: string[];
  villain: string[];
  board: string[];
  category: string;
  difficulty: string;
  seed: number;
  adaptive_weight: number;
  engine: string;
};

const categories: Record<string, string> = {
  pair_vs_overcards: "口袋对子对抗高张",
  flush_draw: "同花听牌",
  straight_draw: "顺子听牌",
  combo_draw: "组合听牌",
  overpair: "超对",
  top_pair: "顶对",
  two_pair: "两对",
  set: "暗三条",
  turn_decision: "转牌决策",
};
type Answer = {
  answer: number;
  true_equity: number;
  absolute_error: number;
  score: number;
  category: string;
  scoring: string;
  weaknesses: Array<{
    category: string;
    average_error: number;
    answers: number;
  }>;
};

export default function Trainer() {
  const zh = useCopy(false, true);
  const [estimate, setEstimate] = useState(50);
  const [seed, setSeed] = useState(20250902);
  const [scenario, setScenario] = useState<Question>();
  const [progress, setProgress] = useState({
    count: 0,
    totalError: 0,
    totalScore: 0,
    weaknesses: [] as Answer["weaknesses"],
  });
  const started = useRef(false);
  // Disable synchronously as well as visually: rapid events must not issue two writes.
  const busy = useRef(false);
  const question = useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (nextSeed: number) =>
      postJson<Question>("/trainer/question", { seed: nextSeed }),
    onSuccess: (result) => {
      setScenario(result);
      setEstimate(50);
      answer.reset();
    },
    onSettled: () => {
      busy.current = false;
    },
  });
  const answer = useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (submission: { question_id: string; answer: number }) =>
      postJson<Answer>("/trainer/answer", submission),
    onSuccess: (result) =>
      setProgress((current) => ({
        count: current.count + 1,
        totalError: current.totalError + result.absolute_error,
        totalScore: current.totalScore + result.score,
        weaknesses: result.weaknesses,
      })),
    onSettled: () => {
      busy.current = false;
    },
  });
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      busy.current = true;
      question.mutate(seed);
    }
  }, [question, seed]);
  function submit() {
    if (busy.current || !scenario || answer.data || question.isError) return;
    busy.current = true;
    answer.mutate({ question_id: scenario.id, answer: estimate / 100 });
  }
  function retryQuestion() {
    if (busy.current) return;
    busy.current = true;
    question.mutate(seed);
  }
  function next() {
    if (busy.current) return;
    busy.current = true;
    const nextSeed = seed + 7919;
    setSeed(nextSeed);
    question.mutate(nextSeed);
  }
  const runningError = progress.count
    ? progress.totalError / progress.count
    : 0;
  const inputDisabled =
    !scenario ||
    question.isPending ||
    question.isError ||
    answer.isPending ||
    !!answer.data;
  const categoryLabel = (category: string) =>
    (zh && categories[category]) || category.replaceAll("_", " ");
  return (
    <div>
      <PageHeader
        eyebrow={zh ? "模块 03 · 概率校准" : "Module 03 · Calibration"}
        title={zh ? "猜胜率" : "Guess the Equity"}
        description={
          zh
            ? "拖动滑块给出估计。评分是连续的，系统会增加你薄弱类别的抽样权重。"
            : "Move the slider, commit an estimate, and learn from continuous scoring. Weak categories receive more sampling weight."
        }
        badge={zh ? "自适应 · 可解释" : "ADAPTIVE · INTERPRETABLE"}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(500px,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {scenario
                    ? categoryLabel(scenario.category)
                    : zh
                      ? "等待题目"
                      : "Awaiting scenario"}
                </Badge>
                <Badge variant="outline">
                  {scenario
                    ? zh
                      ? ({ core: "基础", advanced: "进阶" }[
                          scenario.difficulty
                        ] ?? scenario.difficulty)
                      : scenario.difficulty
                    : "—"}
                </Badge>
              </div>
              <CardTitle>
                {zh ? "英雄的胜率是多少？" : "What is hero’s equity?"}
              </CardTitle>
              <CardDescription>
                {scenario
                  ? `${zh ? "种子" : "seed"} ${scenario.seed} · ${zh ? "自适应权重" : "adaptive weight"} ${scenario.adaptive_weight.toFixed(2)}× · ${zh ? "引擎" : "engine"}: ${scenario.engine}`
                  : zh
                    ? "由后端引擎生成合法牌局。"
                    : "Legal scenarios generated by the backend engine."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {scenario ? (
                <PokerTable
                  hero={scenario.hero}
                  villain={scenario.villain}
                  board={scenario.board}
                  heroLabel={zh ? "英雄" : "HERO"}
                  villainLabel={zh ? "对手" : "VILLAIN"}
                />
              ) : !question.isError ? (
                <div
                  role="status"
                  className="flex h-80 items-center justify-center text-muted-foreground"
                >
                  <LoadingLabel>
                    {zh ? "生成问题" : "Generating question"}
                  </LoadingLabel>
                </div>
              ) : null}
              {scenario && question.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  <LoadingLabel>
                    {zh
                      ? "正在生成下一题；保留上一轮反馈。"
                      : "Generating the next scenario; keeping the previous feedback."}
                  </LoadingLabel>
                </p>
              ) : null}
              {question.error ? (
                <Alert>
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>
                    {zh ? "未能生成题目" : "Could not generate a scenario"}
                  </AlertTitle>
                  <AlertDescription className="flex flex-col gap-3">
                    <p>
                      {zh
                        ? "检查 API 服务或网络连接后重试。重试保留本次请求的种子。"
                        : "Check the API service or your connection, then retry with the same requested seed."}
                    </p>
                    <p className="break-words">{question.error.message}</p>
                    <Button variant="outline" onClick={retryQuestion}>
                      {zh ? "重试出题" : "Retry scenario"}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "你的估计" : "Your estimate"}</CardTitle>
              <CardDescription>
                {zh
                  ? "范围 0–100%；可用方向键以 0.5 个百分点调整。"
                  : "Range 0–100%; use arrow keys for 0.5-point steps."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="font-data text-center text-6xl tracking-[-0.07em] text-primary">
                {estimate.toFixed(1)}%
              </div>
              <Slider
                value={estimate}
                min={0}
                max={100}
                step={0.5}
                onValueChange={(values) =>
                  setEstimate(
                    Number(Array.isArray(values) ? values[0] : values),
                  )
                }
                disabled={inputDisabled}
                aria-label={zh ? "胜率估计" : "Equity estimate"}
              />
              <Button size="lg" onClick={submit} disabled={inputDisabled}>
                <LockKeyhole data-icon="inline-start" />
                {answer.isPending ? (
                  <LoadingLabel>{zh ? "验证中" : "Checking"}</LoadingLabel>
                ) : answer.isError ? (
                  zh ? (
                    "重试提交答案"
                  ) : (
                    "Retry answer"
                  )
                ) : zh ? (
                  "锁定答案"
                ) : (
                  "Lock answer"
                )}
              </Button>
              {answer.error ? (
                <Alert>
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>
                    {zh ? "无法确认本轮结果" : "Could not confirm this round"}
                  </AlertTitle>
                  <AlertDescription>
                    <p>
                      {zh
                        ? "估计值已保留，可手动重试。若响应丢失，成绩可能已保存；若提示已提交或已过期，请开始新题。本次页面统计仅包含收到的成功反馈。"
                        : "Your estimate is preserved for a manual retry. A lost response may mean the score was saved. If already answered or expired, start a new scenario. Page totals include only confirmed feedback."}
                    </p>
                    <p className="break-words">{answer.error.message}</p>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "本轮反馈" : "Round feedback"}</CardTitle>
              <CardDescription>
                {`${zh ? "得分" : "Score"} = ${(answer.data?.scoring ?? "100 × max(0, 1 - (absolute_error / 0.25)²)").replaceAll("absolute_error", zh ? "绝对误差" : "absolute error")}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-5">
              {answer.data ? (
                <>
                  <Metric
                    label={zh ? "你的估计" : "Your estimate"}
                    value={percent(answer.data.answer)}
                  />
                  <Metric
                    label={zh ? "实际胜率" : "Actual equity"}
                    value={percent(answer.data.true_equity)}
                    accent="primary"
                  />
                  <Metric
                    label={zh ? "绝对误差" : "Absolute error"}
                    value={`${(answer.data.absolute_error * 100).toFixed(2)} pp`}
                    accent={
                      answer.data.absolute_error < 0.05 ? "success" : "danger"
                    }
                  />
                  <Metric
                    label={zh ? "得分" : "Score"}
                    value={answer.data.score.toFixed(1)}
                  />
                  <div className="col-span-2">
                    <Progress
                      value={answer.data.score}
                      aria-label={zh ? "本轮得分" : "Round score"}
                    />
                  </div>
                </>
              ) : (
                <p className="col-span-2 text-sm text-muted-foreground">
                  {zh
                    ? "锁定答案后将显示真实引擎结果。"
                    : "Commit your estimate to reveal the engine result."}
                </p>
              )}
              {answer.data || answer.isError ? (
                <Button
                  className="col-span-2"
                  onClick={next}
                  disabled={
                    question.isPending || question.isError || answer.isPending
                  }
                >
                  <RefreshCw data-icon="inline-start" />
                  {question.isPending
                    ? zh
                      ? "正在出题…"
                      : "Generating scenario…"
                    : answer.isError
                      ? zh
                        ? "开始新题"
                        : "Start a new scenario"
                      : zh
                        ? "下一题"
                        : "Next scenario"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "训练进度" : "Training progress"}</CardTitle>
              <CardDescription>
                {zh
                  ? "本次页面访问中已确认的结果；离开或刷新后重置。"
                  : "Confirmed results in this page visit; resets on navigation or reload."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-5">
              <Metric
                label={zh ? "已答题数" : "Questions"}
                value={String(progress.count)}
              />
              <Metric
                label={zh ? "平均误差" : "Average error"}
                value={
                  progress.count ? `${(runningError * 100).toFixed(2)} pp` : "—"
                }
                detail={zh ? "pp = 百分点" : "pp = percentage points"}
              />
              <Metric
                label={zh ? "平均得分" : "Average score"}
                value={
                  progress.count
                    ? (progress.totalScore / progress.count).toFixed(1)
                    : "—"
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "你的薄弱项" : "Your weaknesses"}</CardTitle>
              <CardDescription>
                {zh
                  ? "最近一次成功反馈中的数据库汇总，按平均绝对误差排序；仅影响抽样权重。"
                  : "Database-wide snapshot from the last confirmed answer, ranked by mean absolute error; only sampling weights change."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {progress.weaknesses.length ? (
                progress.weaknesses.slice(0, 5).map((row, index) => (
                  <div
                    key={row.category}
                    className="grid grid-cols-[28px_1fr_auto] items-center gap-3"
                  >
                    <span className="font-data text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm">{categoryLabel(row.category)}</p>
                      <p className="text-xs text-muted-foreground">
                        {zh
                          ? `${row.answers} 次作答`
                          : `${row.answers} ${row.answers === 1 ? "answer" : "answers"}`}
                      </p>
                    </div>
                    <span className="font-data text-sm text-destructive">
                      {(row.average_error * 100).toFixed(1)} pp
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Brain />
                  <span>
                    {zh
                      ? "完成一题后开始建立可解释的薄弱项画像。"
                      : "Complete a round to begin an interpretable weakness profile."}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
          {progress.count >= 5 ? (
            <Card className="border-primary/30">
              <CardHeader>
                <Target className="text-primary" />
                <CardTitle>
                  {zh ? "五题训练已完成" : "Five-round session complete"}
                </CardTitle>
                <CardDescription>
                  {zh
                    ? `平均误差 ${(runningError * 100).toFixed(2)} 个百分点。`
                    : `Mean absolute error: ${(runningError * 100).toFixed(2)} percentage points.`}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
