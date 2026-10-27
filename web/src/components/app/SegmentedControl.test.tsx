import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./SegmentedControl";

const options = [
  { value: "a", label: "Uno" },
  { value: "b", label: "Dos" },
  { value: "c", label: "Tres" },
];

describe("SegmentedControl", () => {
  it("expone un radiogroup con radios y marca el activo", () => {
    render(<SegmentedControl label="Vista" value="b" onChange={() => {}} options={options} />);
    expect(screen.getByRole("radiogroup", { name: "Vista" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Dos" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Uno" })).not.toBeChecked();
  });

  it("cada opción extiende su área pulsable a 44px sin cambiar el alto visual", () => {
    render(<SegmentedControl label="Vista" value="a" onChange={() => {}} options={options} />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveClass("min-h-8", "relative");
      expect(radio.className).toMatch(/before:absolute/);
      expect(radio.className).toMatch(/before:-inset-y-1\.5/); // 32 + 2×6 = 44
    }
  });

  it("las flechas cambian la selección y mueven el foco (con vuelta)", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Vista" value="a" onChange={onChange} options={options} />);
    screen.getByRole("radio", { name: "Uno" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("b");
    expect(screen.getByRole("radio", { name: "Dos" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("ArrowLeft en la primera opción da la vuelta a la última", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Vista" value="a" onChange={onChange} options={options} />);
    screen.getByRole("radio", { name: "Uno" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("clic en una opción llama a onChange", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Vista" value="a" onChange={onChange} options={options} />);
    await userEvent.click(screen.getByRole("radio", { name: "Tres" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
