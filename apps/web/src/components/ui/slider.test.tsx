import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Slider } from "@/components/ui/slider";

beforeEach(() => {
  // Give the real Base UI component geometry in the layout-free jsdom runner.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 300, 20),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("slider input contract", () => {
  it.each([{ value: 50 }, { defaultValue: 50 }])(
    "renders one named thumb for scalar props %j",
    async (props) => {
      render(<Slider {...props} aria-label="Equity estimate" />);
      expect(await screen.findAllByRole("slider")).toHaveLength(1);
      expect(
        screen.getByRole("slider", { name: "Equity estimate" }),
      ).toHaveValue("50");
    },
  );
  it("preserves range thumbs and disabled behavior", async () => {
    render(<Slider value={[20, 80]} aria-label="Interval" disabled />);
    const inputs = await screen.findAllByRole("slider", { name: "Interval" });
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue("20");
    expect(inputs[1]).toHaveValue("80");
    inputs.forEach((input) => expect(input).toBeDisabled());
  });
  it("uses the controlled value before defaults when counting thumbs", async () => {
    render(<Slider value={50} defaultValue={[20, 80]} aria-label="Estimate" />);
    const inputs = await screen.findAllByRole("slider");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveValue("50");
  });
  it("defaults to a single thumb at the minimum", async () => {
    render(<Slider min={10} aria-label="Estimate" />);
    const inputs = await screen.findAllByRole("slider");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveValue("10");
  });
  it.each(["horizontal", "vertical"] as const)(
    "styles the actual %s orientation attribute",
    async (orientation) => {
      const { container } = render(
        <Slider
          defaultValue={50}
          orientation={orientation}
          aria-label="Estimate"
        />,
      );
      await screen.findByRole("slider");
      const track = container.querySelector('[data-slot="slider-track"]');
      expect(track).toHaveAttribute("data-orientation", orientation);
      expect(track).toHaveClass(
        orientation === "horizontal"
          ? "data-[orientation=horizontal]:h-1"
          : "data-[orientation=vertical]:w-1",
      );
      expect(track?.parentElement).toHaveClass(
        orientation === "horizontal"
          ? "data-[orientation=horizontal]:min-h-11"
          : "data-[orientation=vertical]:min-w-11",
      );
    },
  );
});
