"use client";

import { cn } from "@/lib/utils";
const ranks = "AKQJT98765432".split("");
const suits = [
  { code: "s", symbol: "♠", red: false },
  { code: "h", symbol: "♥", red: true },
  { code: "d", symbol: "♦", red: true },
  { code: "c", symbol: "♣", red: false },
];

export function CardSelector({
  selected,
  onSelect,
  label,
  disabled = false,
}: {
  selected: string[];
  onSelect: (card: string) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="font-data mb-3 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </legend>
      <div className="grid grid-cols-13 gap-1" role="grid" aria-label={label}>
        {suits.flatMap((suit) =>
          ranks.map((rank) => {
            const card = `${rank}${suit.code}`;
            const active = selected.includes(card);
            return (
              <button
                key={card}
                type="button"
                onClick={() => onSelect(card)}
                disabled={active || disabled}
                aria-label={`${rank}${suit.symbol}`}
                className={cn(
                  "font-data flex aspect-[0.72] min-w-0 flex-col items-center justify-center rounded-[5px] border bg-muted text-[9px] leading-none transition hover:-translate-y-0.5 hover:border-primary focus-visible:outline-2 focus-visible:outline-ring sm:text-[10px]",
                  suit.red ? "text-[#df7670]" : "text-foreground",
                  active && "border-primary/20 opacity-20",
                )}
              >
                <span>{rank}</span>
                <span>{suit.symbol}</span>
              </button>
            );
          }),
        )}
      </div>
    </fieldset>
  );
}
