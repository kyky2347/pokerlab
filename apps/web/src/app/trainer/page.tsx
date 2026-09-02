"use client";

import { useMutation } from "@tanstack/react-query";
import { Brain, LockKeyhole, RefreshCw, Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ErrorAlert,
  LoadingLabel,
  Metric,
  PageHeader,
  percent,
} from "@/components/lab-ui";
import { PokerTable } from "@/components/poker-table";
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
  const [history, setHistory] = useState<Answer[]>([]);
  const started = useRef(false);
  const question = useMutation({
    mutationFn: (nextSeed: number) =>
      postJson<Question>("/trainer/question", { seed: nextSeed }),
    onSuccess: () => setEstimate(50),
  });
  const answer = useMutation({
    mutationFn: () =>
      postJson<Answer>("/trainer/answer", {
        question_id: question.data?.id,
        answer: estimate / 100,
      }),
    onSuccess: (result) => setHistory((items) => [...items, result]),
  });
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      question.mutate(seed);
    }
  }, [question, seed]);
  function next() {
    const nextSeed = seed + 7919;
    setSeed(nextSeed);
    answer.reset();
    question.mutate(nextSeed);
  }
  const runningError = history.length
    ? history.reduce((sum, row) => sum + row.absolute_error, 0) / history.length
    : 0;
  const error = question.error ?? answer.error;
  return (
    <div>
      <PageHeader
        eyebrow="Module 03 · Calibration"
        title={zh ? "猜胜率" : "Guess the Equity"}
        description={
          zh
            ? "拖动滑块给出估计。评分是连续的，系统会增加你薄弱类别的抽样权重。"
            : "Move the slider, commit an estimate, and learn from continuous scoring. Weak categories receive more sampling weight."
        }
        badge="ADAPTIVE · INTERPRETABLE"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(500px,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {question.data?.category.replaceAll("_", " ") ?? "loading"}
                </Badge>
                <Badge variant="outline">
                  {question.data?.difficulty ?? "—"}
                </Badge>
              </div>
              <CardTitle>
                {zh ? "英雄的胜率是多少？" : "What is hero’s equity?"}
              </CardTitle>
              <CardDescription>
                {question.data
                  ? `seed ${question.data.seed} · adaptive weight ${question.data.adaptive_weight.toFixed(2)}×`
                  : zh
                    ? "正在生成合法牌局…"
                    : "Generating a legal scenario…"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {question.data ? (
                <PokerTable
                  hero={question.data.hero}
                  villain={question.data.villain}
                  board={question.data.board}
                />
              ) : (
                <div className="flex h-80 items-center justify-center text-muted-foreground">
                  <LoadingLabel>
                    {zh ? "生成问题" : "Generating question"}
                  </LoadingLabel>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "你的估计" : "Your estimate"}</CardTitle>
              <CardDescription>0% ───────────────────── 100%</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="font-data text-center text-6xl tracking-[-0.07em] text-primary">
                {estimate.toFixed(1)}%
              </div>
              <Slider
                value={[estimate]}
                min={0}
                max={100}
                step={0.5}
                onValueChange={(values) =>
                  setEstimate(
                    Number(Array.isArray(values) ? values[0] : values),
                  )
                }
                disabled={!question.data || !!answer.data}
                aria-label="Equity estimate"
              />
              <Button
                size="lg"
                onClick={() => answer.mutate()}
                disabled={!question.data || answer.isPending || !!answer.data}
              >
                <LockKeyhole data-icon="inline-start" />
                {answer.isPending ? (
                  <LoadingLabel>{zh ? "验证中" : "Checking"}</LoadingLabel>
                ) : zh ? (
                  "锁定答案"
                ) : (
                  "Lock answer"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "本轮反馈" : "Round feedback"}</CardTitle>
              <CardDescription>
                {answer.data?.scoring ??
                  "Score = 100 × max(0, 1 − (error / 0.25)²)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-5">
              {answer.data ? (
                <>
                  <Metric
                    label="Your estimate"
                    value={percent(answer.data.answer)}
                  />
                  <Metric
                    label="Actual equity"
                    value={percent(answer.data.true_equity)}
                    accent="primary"
                  />
                  <Metric
                    label="Absolute error"
                    value={`${(answer.data.absolute_error * 100).toFixed(2)} pp`}
                    accent={
                      answer.data.absolute_error < 0.05 ? "success" : "danger"
                    }
                  />
                  <Metric label="Score" value={answer.data.score.toFixed(1)} />
                  <div className="col-span-2">
                    <Progress value={answer.data.score} />
                  </div>
                  <Button className="col-span-2" onClick={next}>
                    <RefreshCw data-icon="inline-start" />
                    {zh ? "下一题" : "Next scenario"}
                  </Button>
                </>
              ) : (
                <p className="col-span-2 text-sm text-muted-foreground">
                  {zh
                    ? "锁定答案后将显示真实引擎结果。"
                    : "Commit your estimate to reveal the engine result."}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "训练进度" : "Training progress"}</CardTitle>
              <CardDescription>
                {zh ? "当前浏览器会话" : "Current browser session"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-5">
              <Metric label="Questions" value={String(history.length)} />
              <Metric
                label="Average error"
                value={`${(runningError * 100).toFixed(2)} pp`}
              />
              <Metric
                label="Average score"
                value={
                  history.length
                    ? (
                        history.reduce((sum, row) => sum + row.score, 0) /
                        history.length
                      ).toFixed(1)
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
                  ? "按平均绝对误差排序；模型只提高抽样权重。"
                  : "Ranked by mean absolute error; the adaptive model only changes sampling weights."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {answer.data?.weaknesses.length ? (
                answer.data.weaknesses.slice(0, 5).map((row, index) => (
                  <div
                    key={row.category}
                    className="grid grid-cols-[28px_1fr_auto] items-center gap-3"
                  >
                    <span className="font-data text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm">
                        {row.category.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.answers} answers
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
          {history.length >= 5 ? (
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
          {error ? <ErrorAlert message={error.message} /> : null}
        </div>
      </div>
    </div>
  );
}
