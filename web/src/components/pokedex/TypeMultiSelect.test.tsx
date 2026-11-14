import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { abrirMenu } from "@/lib/test-utils";
import type { PokemonType } from "@/lib/pokemon-types";
import { TypeMultiSelect } from "./TypeMultiSelect";

function Harness({ initial = [], onChange }: { initial?: PokemonType[]; onChange?: (v: PokemonType[]) => void }) {
  const [value, setValue] = useState<PokemonType[]>(initial);
  return <TypeMultiSelect value={value} onChange={(v) => { setValue(v); onChange?.(v); }} />;
}

describe("TypeMultiSelect", () => {
  it("vacío muestra el disparador y ningún chip", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Agregar tipo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Quitar/ })).toBeNull();
  });

  it("elegir un tipo del menú lo agrega como chip de su color", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await abrirMenu(screen.getByRole("button", { name: "Agregar tipo" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Fuego" }));
    expect(onChange).toHaveBeenLastCalledWith(["fire"]);
    const chip = screen.getByRole("button", { name: "Quitar Fuego" });
    expect(chip.className).toMatch(/type-fire/);
  });

  it("tocar un chip lo quita", async () => {
    const onChange = vi.fn();
    render(<Harness initial={["fire", "flying"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar Fuego" }));
    expect(onChange).toHaveBeenLastCalledWith(["flying"]);
    expect(screen.queryByRole("button", { name: "Quitar Fuego" })).toBeNull();
  });

  it("con dos tipos elegidos no deja agregar un tercero", () => {
    render(<Harness initial={["fire", "flying"]} />);
    const trigger = screen.getByRole("button", { name: "Agregar tipo" });
    expect(trigger).toBeDisabled();
    expect(screen.getByText("Máximo 2")).toBeTruthy();
  });

  it("Limpiar quita todos", async () => {
    const onChange = vi.fn();
    render(<Harness initial={["fire", "flying"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar todos los tipos" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
