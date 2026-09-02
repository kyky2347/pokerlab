import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { handLabel, RangeMatrix } from "@/components/range-matrix";

describe("range matrix", () => {
  it("maps the diagonal, suited triangle, and offsuit triangle", () => {
    expect(handLabel(0, 0)).toBe("AA");
    expect(handLabel(0, 1)).toBe("AKs");
    expect(handLabel(1, 0)).toBe("AKo");
  });

  it("cycles a cell to 25 percent", () => {
    const onChange = vi.fn();
    render(<RangeMatrix value={{}} onChange={onChange} label="Test range" />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "AKs 0 percent" }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ AKs: 0.25 }),
    );
  });
});
