import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EVEditor } from "./EVEditor";

describe("EVEditor", () => {
  it("un preset reemplaza los EVs y no toca los IVs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const ivs = { Atk: 0 };
    render(<EVEditor evs={{ Def: 100, SpD: 100 }} ivs={ivs} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Atacante físico" }));
    expect(onChange).toHaveBeenCalledWith({ evs: { HP: 4, Atk: 252, Spe: 252 }, ivs });
  });

  it("Limpiar deja los EVs vacíos", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EVEditor evs={{ HP: 252 }} ivs={{}} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Limpiar EVs" }));
    expect(onChange).toHaveBeenCalledWith({ evs: {}, ivs: {} });
  });

  it("dice cuántos EVs quedan por repartir", () => {
    render(<EVEditor evs={{ HP: 252, Atk: 252 }} ivs={{}} onChange={vi.fn()} />);
    expect(screen.getByText(/quedan 6/)).toBeInTheDocument();
  });
});
