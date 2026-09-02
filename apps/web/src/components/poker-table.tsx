import { PokerCard } from "@/components/poker-card";

export function PokerTable({
  hero,
  villain,
  board,
  heroLabel = "HERO",
  villainLabel = "VILLAIN",
}: {
  hero: string[];
  villain: string[];
  board: string[];
  heroLabel?: string;
  villainLabel?: string;
}) {
  return (
    <div className="probability-grid relative mx-auto flex aspect-[1.45] w-full max-w-3xl items-center justify-center overflow-hidden rounded-[45%] border border-primary/25 bg-felt-deep shadow-[inset_0_0_80px_rgb(0_0_0/45%),0_28px_70px_rgb(0_0_0/28%)]">
      <div className="absolute inset-4 rounded-[45%] border border-white/5" />
      <div className="absolute top-4 flex flex-col items-center gap-2 sm:top-7">
        <span className="font-data text-[9px] tracking-[0.18em] text-white/55">
          {villainLabel}
        </span>
        <div className="flex gap-1.5">
          {villain.length ? (
            villain.map((card) => <PokerCard key={card} card={card} compact />)
          ) : (
            <>
              <PokerCard faceDown compact />
              <PokerCard faceDown compact />
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1 sm:gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <PokerCard
            key={board[index] ?? `empty-${index}`}
            card={board[index]}
            compact
          />
        ))}
      </div>
      <div className="absolute bottom-4 flex flex-col items-center gap-2 sm:bottom-7">
        <div className="flex gap-1.5">
          {hero.map((card) => (
            <PokerCard key={card} card={card} compact />
          ))}
        </div>
        <span className="font-data text-[9px] tracking-[0.18em] text-white/55">
          {heroLabel}
        </span>
      </div>
    </div>
  );
}
