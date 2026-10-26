import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RotationRules } from "./RotationRules";

describe("RotationRules", () => {
  it("muestra 3 puntos clave y los detalles colapsados por defecto", () => {
    render(<RotationRules maxRotations={3} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/3 rotaciones por temporada/)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Cómo funcionan/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Editar un set no consume/)).not.toBeInTheDocument();
  });

  it("se expande y se contrae con el teclado", async () => {
    render(<RotationRules maxRotations={3} />);
    const toggle = screen.getByRole("button", { name: /Cómo funcionan/ });
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Editar un set no consume/)).toBeVisible();
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
