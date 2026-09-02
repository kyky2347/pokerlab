"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const suits = {
  c: { symbol: "♣", name: "clubs", red: false },
  d: { symbol: "♦", name: "diamonds", red: true },
  h: { symbol: "♥", name: "hearts", red: true },
  s: { symbol: "♠", name: "spades", red: false },
} as const;

export function PokerCard({
  card,
  selected,
  disabled,
  faceDown,
  compact,
  onClick,
}: {
  card?: string;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const suit = card ? suits[card[1] as keyof typeof suits] : undefined;
  const content = faceDown ? (
    <span className="probability-grid absolute inset-1.5 rounded-[6px] border border-primary/25 bg-felt-deep" />
  ) : card && suit ? (
    <>
      <span className="leading-none">{card[0]}</span>
      <span className="leading-none" aria-label={suit.name}>
        {suit.symbol}
      </span>
    </>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      whileHover={disabled ? undefined : { y: -3 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={card ? `${card[0]} of ${suit?.name}` : "Empty card slot"}
      aria-pressed={selected}
      className={cn(
        "relative inline-flex shrink-0 flex-col items-start justify-between rounded-[9px] border bg-[#e9e5dc] p-1.5 font-serif font-bold text-[#151817] shadow-[0_8px_20px_rgb(0_0_0/25%)] outline-none transition focus-visible:ring-3 focus-visible:ring-ring/60",
        compact
          ? "h-14 w-10 text-sm"
          : "h-[88px] w-16 text-xl sm:h-24 sm:w-[70px]",
        suit?.red && "text-[#a93636]",
        selected && "border-primary ring-3 ring-primary/35",
        disabled && "cursor-not-allowed opacity-20 grayscale",
        !card &&
          "items-center justify-center border-dashed bg-card text-muted-foreground shadow-none",
      )}
    >
      {content}
    </motion.button>
  );
}
