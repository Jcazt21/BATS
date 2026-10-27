/* eslint-disable @typescript-eslint/no-explicit-any */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { abrirMenu, renderWithProviders } from "@/lib/test-utils";
import { SlotBoard, type Slot } from "./SlotBoard";

const slot = (name: string, over: Partial<Slot> = {}): Slot => ({
  uid: name, name, types: "Dragon / Ground", status: "ready", hasContent: true, ...over,
});

function Harness({ initial, spies = {} }: { initial: Slot[]; spies?: Partial<Record<string, (...a: any[]) => void>> }) {
  const [slots, setSlots] = useState(initial);
  const [sel, setSel] = useState(0);
  return (
    <SlotBoard
      slots={slots} maxSize={6} selected={sel}
      onSelect={(i) => { setSel(i); spies.onSelect?.(i); }}
      onAdd={() => spies.onAdd?.()}
      onRemove={(i) => { setSlots((c) => c.filter((_, k) => k !== i)); spies.onRemove?.(i); }}
      onSwap={(i) => spies.onSwap?.(i)}
      onCopy={(i) => spies.onCopy?.(i)}
      onMove={(i, d) => setSlots((c) => { const n = [...c]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; })}
      onOpen={(i) => spies.onOpen?.(i)}
    />
  );
}

describe("SlotBoard", () => {
  it("renderiza exactamente maxSize slots: ocupados con estado y vacíos como botones", () => {
    renderWithProviders(<Harness initial={[slot("Garchomp"), slot("Mew", { status: "error" }), slot("Eevee", { status: "incomplete" })]} />);
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByRole("img", { name: "Listo" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Con problemas" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Incompleto" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Agregar Pokémon" })).toHaveLength(3);
  });

  it("un slot vacío pide agregar", async () => {
    const onAdd = vi.fn();
    renderWithProviders(<Harness initial={[slot("Garchomp")]} spies={{ onAdd }} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Agregar Pokémon" })[0]);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("selección con aria-pressed y roving tabindex; las flechas la mueven", async () => {
    renderWithProviders(<Harness initial={[slot("Garchomp"), slot("Mew")]} />);
    const [a, b] = screen.getAllByRole("button", { pressed: true }).concat(screen.getAllByRole("button", { pressed: false }).slice(0, 1));
    expect(a).toHaveTextContent("Garchomp");
    expect(a).toHaveAttribute("tabindex", "0");
    a.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /^Mew/, pressed: true })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /^Mew/, pressed: true })).toHaveFocus(); // tope
    expect(b).toBeDefined();
  });

  it("tocar o pulsar Enter abre el editor", async () => {
    const onOpen = vi.fn();
    renderWithProviders(<Harness initial={[slot("Garchomp")]} spies={{ onOpen }} />);
    screen.getByRole("button", { name: /^Garchomp/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it("Alt+flecha reordena y lo anuncia en una región viva", async () => {
    renderWithProviders(<Harness initial={[slot("Garchomp"), slot("Mew")]} />);
    screen.getByRole("button", { name: /^Garchomp/ }).focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    const names = within(screen.getByRole("list")).getAllByRole("listitem").slice(0, 2).map((li) => li.textContent);
    expect(names[0]).toMatch(/Mew/);
    expect(screen.getByRole("status")).toHaveTextContent("Garchomp movido a la posición 2 de 2");
  });

  it("el menú del slot ofrece Copiar y Cambiar", async () => {
    const onCopy = vi.fn(); const onSwap = vi.fn();
    renderWithProviders(<Harness initial={[slot("Garchomp")]} spies={{ onCopy, onSwap }} />);
    await abrirMenu(screen.getByRole("button", { name: "Más acciones de Garchomp" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Copiar/ }));
    expect(onCopy).toHaveBeenCalledWith(0);
    await abrirMenu(screen.getByRole("button", { name: "Más acciones de Garchomp" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Cambiar/ }));
    expect(onSwap).toHaveBeenCalledWith(0);
  });

  it("Quitar pide confirmación solo si el set tiene contenido", async () => {
    const onRemove = vi.fn();
    renderWithProviders(<Harness initial={[slot("Garchomp"), slot("Mew", { hasContent: false })]} spies={{ onRemove }} />);
    await abrirMenu(screen.getByRole("button", { name: "Más acciones de Mew" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Quitar/ }));
    expect(onRemove).toHaveBeenCalledWith(1); // sin contenido: directo

    await abrirMenu(screen.getByRole("button", { name: "Más acciones de Garchomp" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Quitar/ }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar" }));
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
