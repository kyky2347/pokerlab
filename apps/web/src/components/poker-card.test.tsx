import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PokerCard } from "@/components/poker-card";

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, ...props }: React.ComponentProps<"button">) => (
      <button {...props}>{children}</button>
    ),
  },
}));

describe("PokerCard", () => {
  it("renders semantic rank and suit", () => {
    render(<PokerCard card="Ah" onClick={() => undefined} />);
    expect(
      screen.getByRole("button", { name: "A of hearts" }),
    ).toHaveTextContent("A♥");
  });

  it("disables blocked cards", () => {
    render(<PokerCard card="Ks" disabled onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "K of spades" })).toBeDisabled();
  });
});
