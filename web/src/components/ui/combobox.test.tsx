import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxItem } from "./combobox";

const ITEMS: ComboboxItem[] = [
  { id: "garchomp", label: "Garchomp", sublabel: "Dragon / Ground" },
  { id: "dragonite", label: "Dragonite", sublabel: "Dragon / Flying" },
  { id: "gible", label: "Gible", sublabel: "Dragon / Ground" },
];

function setup(items: ComboboxItem[] = ITEMS) {
  const onChange = vi.fn();
  render(<Combobox items={items} value={null} onChange={onChange} placeholder="Buscar especie" />);
  return { onChange };
}

describe("Combobox", () => {
  it("es un combobox accesible, cerrado al inicio", () => {
    setup();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filtra las opciones al escribir", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole("combobox"), "gar");
    expect(screen.getByRole("option", { name: /Garchomp/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Dragonite/ })).not.toBeInTheDocument();
  });

  it("selecciona con el teclado (flechas + Enter)", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const input = screen.getByRole("combobox");
    await user.click(input); // abre la lista, activo = Garchomp (índice 0)
    await user.keyboard("{ArrowDown}{Enter}"); // baja a Dragonite y confirma
    expect(onChange).toHaveBeenCalledWith("dragonite");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); // se cierra tras elegir
  });

  it("anuncia el elemento activo con aria-activedescendant", async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    const active = input.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(document.getElementById(active!)).toHaveTextContent("Dragonite");
  });

  it("Escape cierra la lista sin seleccionar", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sin resultados muestra emptyText", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole("combobox"), "zzz");
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });

  it("clic en una opción selecciona y cierra", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /Gible/ }));
    expect(onChange).toHaveBeenCalledWith("gible");
  });
});
