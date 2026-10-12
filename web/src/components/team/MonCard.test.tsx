import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonCard } from "./MonCard";

describe("MonCard", () => {
  it("con onSelect la cabecera es un botón aria-pressed y las acciones quedan fuera", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ul>
        <MonCard mon={{ name: "Dragonite" }} selected onSelect={onSelect} actions={<button type="button">Quitar</button>} />
      </ul>,
    );
    const header = screen.getByRole("button", { name: /Dragonite/ });
    expect(header).toHaveAttribute("aria-pressed", "true");
    expect(within(header).queryByRole("button")).toBeNull();
    expect(header).not.toContainElement(screen.getByRole("button", { name: "Quitar" }));
    await user.click(header);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("sin onSelect no hay botón de selección", () => {
    render(
      <ul>
        <MonCard mon={{ name: "Dragonite" }} actions={<button type="button">Quitar</button>} />
      </ul>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Quitar" })).toBeInTheDocument();
  });
});
