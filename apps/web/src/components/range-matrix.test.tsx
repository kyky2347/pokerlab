import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handLabel,
  RangeMatrix,
  type RangeWeights,
} from "@/components/range-matrix";
import { useLabStore } from "@/lib/store";

function Harness({ initial = {} }: { initial?: RangeWeights }) {
  const [value, onChange] = useState(initial);
  return (
    <>
      <RangeMatrix value={value} onChange={onChange} label="Test range" />
      <button>After matrix</button>
    </>
  );
}

const cell = (hand: string, weight = 0) =>
  screen.getByRole("button", { name: `${hand} ${weight} percent` });

// jsdom lacks native PointerEvent; retain real mouse fields and add pointer identity.
function pointer(
  target: Element | Window,
  type: string,
  options: MouseEventInit & {
    pointerId?: number;
    pointerType?: string;
    isPrimary?: boolean;
  } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    buttons: 1,
    ...options,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? "mouse" },
    isPrimary: { value: options.isPrimary ?? true },
  });
  fireEvent(target, event);
}

beforeEach(() => {
  useLabStore.setState({ locale: "en" });
  // Let Base UI measure its real slider in the layout-free test environment.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 300, 20),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useLabStore.setState({ locale: "en" });
});

describe("range matrix", () => {
  it("maps all 169 unique classes with correct diagonal and triangles", () => {
    expect(handLabel(0, 0)).toBe("AA");
    expect(handLabel(0, 1)).toBe("AKs");
    expect(handLabel(1, 0)).toBe("AKo");
    render(<Harness />);
    const grid = screen.getByRole("grid", { name: "Test range" });
    expect(within(grid).getAllByRole("row")).toHaveLength(13);
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(169);
    const buttons = within(grid).getAllByRole("button");
    expect(new Set(buttons.map((button) => button.textContent)).size).toBe(169);
    expect(buttons.filter((button) => button.tabIndex === 0)).toEqual([
      cell("AA"),
    ]);
  });

  it.each([
    [0, 25],
    [0.25, 50],
    [0.37, 50],
    [0.5, 75],
    [0.75, 100],
    [0.99, 100],
    [1, 0],
  ])("advances %s to the next quarter step %s", async (initial, expected) => {
    render(<Harness initial={{ AKs: initial }} />);
    await userEvent.click(cell("AKs", Math.round(initial * 100)));
    expect(cell("AKs", expected)).toBeInTheDocument();
  });

  it("activates exactly once with Enter, Space, or an assistive click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.tab();
    expect(cell("AA")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(cell("AA", 25)).toHaveFocus();
    await user.keyboard(" ");
    expect(cell("AA", 50)).toHaveFocus();
    fireEvent.click(cell("AA", 50), { detail: 0 });
    expect(cell("AA", 75)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After matrix" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(cell("AA", 75)).toHaveFocus();
  });

  it("navigates rows and boundaries without changing weights, and selects the slider target", async () => {
    const onChange = vi.fn();
    render(<RangeMatrix value={{}} onChange={onChange} label="Test range" />);
    const user = userEvent.setup();
    act(() => cell("AA").focus());
    await user.keyboard("{ArrowLeft}{ArrowUp}");
    expect(cell("AA")).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(cell("KK")).toHaveFocus();
    expect(
      screen.getByRole("slider", { name: "KK weight" }),
    ).toBeInTheDocument();
    await user.keyboard("{End}{ArrowRight}");
    expect(cell("K2s")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(cell("AKo")).toHaveFocus();
    await user.keyboard("{Control>}{End}{/Control}{ArrowRight}{ArrowDown}");
    expect(cell("22")).toHaveFocus();
    await user.keyboard("{Control>}{Home}{/Control}");
    expect(cell("AA")).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adjusts custom weights by 1% and renders a rounded percentage", async () => {
    render(<Harness initial={{ AA: 0.57 }} />);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(cell("AA", 58)).toHaveTextContent("58%");
    expect(cell("AA", 58)).not.toHaveTextContent("57.999");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(cell("AA", 75)).toBeInTheDocument();
  });

  it.each([
    { button: 2, buttons: 2 },
    { button: 1, buttons: 4 },
    { ctrlKey: true },
    { isPrimary: false },
  ])("ignores non-editing pointer down %j", (options) => {
    const onChange = vi.fn();
    render(<RangeMatrix value={{}} onChange={onChange} label="Test range" />);
    pointer(cell("AKs"), "pointerdown", options);
    pointer(cell("AQs"), "pointerover");
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["touch", "pen"])(
    "leaves %s down/move/cancel unchanged and edits only a completed tap",
    (pointerType) => {
      const onChange = vi.fn();
      render(<RangeMatrix value={{}} onChange={onChange} label="Test range" />);
      pointer(cell("AKs"), "pointerdown", { pointerType });
      pointer(cell("AQs"), "pointerover", { pointerType });
      pointer(window, "pointercancel", { pointerType });
      expect(onChange).not.toHaveBeenCalled();
      pointer(cell("AKs"), "pointerdown", { pointerType });
      pointer(window, "pointerup", { pointerType });
      fireEvent.click(cell("AKs"), { detail: 1 });
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ AKs: 0.25 });
    },
  );

  it("keeps every cell in a rapid stroke and ignores a second pointer", () => {
    const onChange = vi.fn();
    render(
      <RangeMatrix value={{ AA: 1 }} onChange={onChange} label="Test range" />,
    );
    pointer(cell("AKs"), "pointerdown");
    pointer(cell("AQs"), "pointerover", { pointerId: 2 });
    pointer(cell("AJs"), "pointerover");
    pointer(cell("ATs"), "pointerover");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith({
      AA: 1,
      AKs: 0.25,
      AJs: 0.25,
      ATs: 0.25,
    });
  });

  it.each([
    "pointerup",
    "pointercancel",
    "blur",
    "visibilitychange",
    "contextmenu",
    "missing-release",
  ])("stops painting after %s", (ending) => {
    const onChange = vi.fn();
    render(<RangeMatrix value={{}} onChange={onChange} label="Test range" />);
    pointer(cell("AKs"), "pointerdown");
    if (ending === "visibilitychange") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      fireEvent(document, new Event(ending));
    } else if (ending === "contextmenu") {
      fireEvent.contextMenu(cell("AKs"));
    } else if (ending === "missing-release") {
      pointer(cell("AQs"), "pointerover", { buttons: 0 });
    } else {
      fireEvent(window, new Event(ending));
    }
    pointer(cell("AJs"), "pointerover");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ AKs: 0.25 });
  });

  it("does not apply a pointer click twice or suppress a subsequent keyboard activation", () => {
    render(<Harness />);
    pointer(cell("AKs"), "pointerdown");
    pointer(window, "pointerup");
    fireEvent.click(cell("AKs", 25), { detail: 1 });
    expect(cell("AKs", 25)).toBeInTheDocument();
    fireEvent.click(cell("AKs", 25), { detail: 0 });
    expect(cell("AKs", 50)).toBeInTheDocument();
  });

  it("cancels painting when disabled and respects a replacement controlled range", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RangeMatrix value={{}} onChange={onChange} label="Test range" />,
    );
    pointer(cell("AKs"), "pointerdown");
    rerender(
      <RangeMatrix
        value={{ QQ: 1 }}
        onChange={onChange}
        label="Test range"
        disabled
      />,
    );
    pointer(cell("AQs"), "pointerover");
    fireEvent.click(cell("QQ", 100));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("slider")).toBeDisabled();
    rerender(
      <RangeMatrix value={{ QQ: 1 }} onChange={onChange} label="Test range" />,
    );
    pointer(cell("AQs"), "pointerover");
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(cell("AJs"));
    expect(onChange).toHaveBeenLastCalledWith({ QQ: 1, AJs: 0.25 });
  });

  it("localizes instructions and accessible weights in Chinese", async () => {
    useLabStore.setState({ locale: "zh" });
    render(<Harness initial={{ AA: 0.57 }} />);
    expect(screen.getByRole("grid")).toHaveAccessibleDescription(/方向键移动/);
    expect(
      screen.getByRole("button", { name: "AA 权重 57%" }),
    ).toHaveTextContent("57%");
    expect(
      await screen.findByRole("slider", { name: "AA 权重" }),
    ).toHaveAttribute("aria-valuenow", "57");
  });
});
