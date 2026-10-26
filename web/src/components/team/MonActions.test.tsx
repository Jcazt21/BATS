import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { abrirMenu } from "@/lib/test-utils";
import { MonActions } from "./MonActions";

function montar(over: Partial<React.ComponentProps<typeof MonActions>> = {}) {
  const props = { name: "Dragonite", onEdit: vi.fn(), onCopy: vi.fn(), onSwap: vi.fn(), onRemove: vi.fn(), ...over };
  render(<MonActions {...props} />);
  return props;
}

describe("MonActions", () => {
  it("la acción principal es 'Editar' con hit-area ≥44px (h-11)", async () => {
    const p = montar();
    const editar = screen.getByRole("button", { name: /Editar/ });
    expect(editar).toHaveClass("h-11");
    await userEvent.click(editar);
    expect(p.onEdit).toHaveBeenCalledOnce();
  });

  it("el menú 'Más' ofrece Copiar, Cambiar y Quitar", async () => {
    const p = montar();
    const mas = screen.getByRole("button", { name: "Más acciones de Dragonite" });
    expect(mas).toHaveClass("size-11");
    await abrirMenu(mas);
    expect(screen.getByRole("menuitem", { name: /Copiar/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Cambiar/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /Quitar/ }));
    expect(p.onRemove).toHaveBeenCalledOnce();
  });

  it("Copiar y Cambiar llaman a sus callbacks", async () => {
    const p = montar();
    await abrirMenu(screen.getByRole("button", { name: /Más acciones/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Copiar/ }));
    expect(p.onCopy).toHaveBeenCalledOnce();
    await abrirMenu(screen.getByRole("button", { name: /Más acciones/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Cambiar/ }));
    expect(p.onSwap).toHaveBeenCalledOnce();
  });

  it("es operable por teclado: Enter abre, flechas navegan, Escape cierra y devuelve el foco", async () => {
    montar();
    const mas = screen.getByRole("button", { name: /Más acciones/ });
    mas.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("menuitem").some((i) => i === document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(mas).toHaveFocus();
  });
});
