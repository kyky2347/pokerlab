"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Slider } from "@/components/ui/slider";
import { useCopy } from "@/lib/store";
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
  const zh = useCopy(false, true);
  const helpId = useId();
  const cells = useRef<Record<string, HTMLButtonElement | null>>({});
  const weights = useRef(value);
  const painting = useRef<{ pointerId: number; weight: number } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    weights.current = value;
  }, [value]);
  useEffect(() => {
    painting.current = null;
  }, [disabled, label]);
  useEffect(() => {
    const stop = () => {
      painting.current = null;
    };
    const hide = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  function changeWeight(hand: string, weight: number) {
    if (disabled) return;
    // Keep rapid pointer events cumulative until the controlled value renders.
    weights.current = { ...weights.current, [hand]: weight };
    onChange(weights.current);
  }
  function cycle(hand: string) {
    const next = ((Math.floor((weights.current[hand] ?? 0) * 4) + 1) % 5) / 4;
    setSelected(hand);
    changeWeight(hand, next);
    return next;
  }
  function navigate(
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) {
    if (
      event.altKey ||
      event.metaKey ||
      (event.ctrlKey && event.key !== "Home" && event.key !== "End")
    )
      return;
    let nextRow = row;
    let nextColumn = column;
    switch (event.key) {
      case "ArrowLeft":
        nextColumn = Math.max(0, column - 1);
        break;
      case "ArrowRight":
        nextColumn = Math.min(12, column + 1);
        break;
      case "ArrowUp":
        nextRow = Math.max(0, row - 1);
        break;
      case "ArrowDown":
        nextRow = Math.min(12, row + 1);
        break;
      case "Home":
        nextColumn = 0;
        if (event.ctrlKey) nextRow = 0;
        break;
      case "End":
        nextColumn = 12;
        if (event.ctrlKey) nextRow = 12;
        break;
      default:
        return;
    }
    event.preventDefault();
    painting.current = null;
    cells.current[handLabel(nextRow, nextColumn)]?.focus();
  }
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {label}
          </p>
          <p
            id={helpId}
            className="mt-1 max-w-prose text-sm text-muted-foreground"
          >
            {zh
              ? "点击 / 轻触：0 → 25 → 50 → 75 → 100%；鼠标拖动可涂选。"
              : "Click / tap: 0 → 25 → 50 → 75 → 100%; drag with a mouse to paint."}
            <br />
            {zh
              ? "方向键移动，Enter / 空格修改；滑块精调至 1%。"
              : "Arrow keys move; Enter / Space changes weight. Slider adjusts by 1%."}
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
              changeWeight(
                selected,
                Number(Array.isArray(values) ? values[0] : values) / 100,
              )
            }
            min={0}
            max={100}
            step={1}
            aria-label={zh ? `${selected} 权重` : `${selected} weight`}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="-m-1 overflow-x-auto p-1">
        <div
          className="grid min-w-[620px] gap-1"
          role="grid"
          aria-label={label}
          aria-describedby={helpId}
        >
          {rangeRanks.map((rank, row) => (
            <div key={rank} role="row" className="grid grid-cols-13 gap-1">
              {rangeRanks.map((__, column) => {
                const hand = handLabel(row, column);
                const weight = value[hand] ?? 0;
                return (
                  <div key={hand} role="gridcell">
                    <button
                      ref={(node) => {
                        cells.current[hand] = node;
                      }}
                      type="button"
                      disabled={disabled}
                      tabIndex={selected === hand ? 0 : -1}
                      onFocus={() => setSelected(hand)}
                      onKeyDown={(event) => navigate(event, row, column)}
                      onPointerDown={(event) => {
                        painting.current = null;
                        suppressClick.current = false;
                        if (
                          disabled ||
                          event.button !== 0 ||
                          !event.isPrimary ||
                          event.ctrlKey
                        )
                          return;
                        // Touch and pen use native click so a scroll gesture cannot edit.
                        if (event.pointerType !== "mouse") return;
                        suppressClick.current = true;
                        painting.current = {
                          pointerId: event.pointerId,
                          weight: cycle(hand),
                        };
                      }}
                      onPointerEnter={(event) => {
                        const stroke = painting.current;
                        if (
                          disabled ||
                          !stroke ||
                          event.pointerId !== stroke.pointerId
                        )
                          return;
                        if (!(event.buttons & 1)) {
                          painting.current = null;
                          return;
                        }
                        event.currentTarget.focus({ preventScroll: true });
                        changeWeight(hand, stroke.weight);
                      }}
                      onContextMenu={() => {
                        painting.current = null;
                      }}
                      onClick={(event) => {
                        if (disabled || event.button !== 0 || event.ctrlKey)
                          return;
                        // Mouse down already edited; keyboard/AT clicks have detail 0.
                        if (event.detail !== 0 && suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        suppressClick.current = false;
                        painting.current = null;
                        cycle(hand);
                      }}
                      aria-label={
                        zh
                          ? `${hand} 权重 ${Math.round(weight * 100)}%`
                          : `${hand} ${Math.round(weight * 100)} percent`
                      }
                      className={cn(
                        "relative aspect-square w-full rounded-md border text-[10px] font-semibold outline-none transition select-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring sm:text-xs",
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
                          {Math.round(weight * 100)}%
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
