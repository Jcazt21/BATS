import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestrictionField } from "./RestrictionField";

const spec = { label: "Registro cerrado", hint: "Nadie puede cambiar su equipo", type: "bool", default: false } as never;

describe("RestrictionField · interruptor", () => {
  it("alterna con role=switch y llama a onChange", async () => {
    const onChange = vi.fn();
    render(<RestrictionField rkey="registration_closed" spec={spec} value={false} onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: /Registro cerrado/ });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith("registration_closed", true);
  });

  it("la perilla se desliza con duration-200 ease-ios", () => {
    render(<RestrictionField rkey="registration_closed" spec={spec} value onChange={() => {}} />);
    const perilla = screen.getByRole("switch").firstElementChild!;
    expect(perilla).toHaveClass("transition-transform", "duration-200", "ease-ios");
    expect(screen.getByRole("switch")).toHaveClass("duration-200");
  });
});
