"use client";

import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type RangeWeights = Record<string, number>;
export const rangeRanks = "AKQJT98765432".split("");
export function handLabel(row: number, column: number) {
  if (row === column) return `${rangeRanks[row]}${rangeRanks[column]}`;
  if (row < column) return `${rangeRanks[row]}${rangeRanks[column]}s`;
  return `${rangeRanks[column]}${rangeRanks[row]}o`;
}

export function RangeMatrix({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: RangeWeights;
  onChange: (value: RangeWeights) => void;
  label: string;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState("AA");
  const [painting, setPainting] = useState<number | null>(null);
  useEffect(() => {
    const stop = () => setPainting(null);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);
  function cycle(hand: string) {
    const next = ((value[hand] ?? 0) + 0.25) % 1.25;
    setSelected(hand);
    setPainting(next);
    onChange({ ...value, [hand]: next });
  }
  function paint(hand: string) {
    if (painting === null) return;
    setSelected(hand);
    onChange({ ...value, [hand]: painting });
  }
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click or drag · 0 / 25 / 50 / 75 / 100%
          </p>
        </div>
        <div className="w-44">
          <div className="mb-1 flex justify-between text-xs">
            <span>{selected}</span>
            <span className="font-data">
              {Math.round((value[selected] ?? 0) * 100)}%
            </span>
          </div>
          <Slider
            value={[Math.round((value[selected] ?? 0) * 100)]}
            onValueChange={(values) =>
              onChange({
                ...value,
                [selected]:
                  Number(Array.isArray(values) ? values[0] : values) / 100,
              })
            }
            min={0}
            max={100}
            step={1}
            aria-label={`${selected} weight`}
            disabled={disabled}
          />
        </div>
      </div>
      <div
        className="grid min-w-[620px] grid-cols-13 gap-1"
        role="grid"
        aria-label={label}
      >
        {rangeRanks.flatMap((_, row) =>
          rangeRanks.map((__, column) => {
            const hand = handLabel(row, column);
            const weight = value[hand] ?? 0;
            return (
              <button
                key={hand}
                type="button"
                disabled={disabled}
                onPointerDown={() => cycle(hand)}
                onPointerEnter={() => paint(hand)}
                aria-label={`${hand} ${Math.round(weight * 100)} percent`}
                className={cn(
                  "relative aspect-square rounded-md border text-[10px] font-semibold outline-none transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring sm:text-xs",
                  selected === hand && "ring-2 ring-primary/50",
                  weight === 0 && "bg-muted/35 text-muted-foreground",
                )}
                style={
                  weight > 0
                    ? {
                        background: `linear-gradient(to top, var(--felt) ${weight * 100}%, var(--card) ${weight * 100}%)`,
                      }
                    : undefined
                }
              >
                <span>{hand}</span>
                {weight > 0 && weight < 1 ? (
                  <span className="font-data absolute right-1 bottom-0.5 text-[7px] text-muted-foreground">
                    {weight * 100}%
                  </span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
