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

describe("EVEditor: IVs y total", () => {
  it("los IVs están visibles como fila compacta (sin enlace que los oculte)", () => {
    render(<EVEditor evs={{}} ivs={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "IVs" })).toBeVisible();
    expect(screen.getByLabelText("IVs de Atk")).toHaveValue(31);
  });

  it("el atajo '0 Atk / 0 Spe' baja ambos IVs y no toca los EVs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EVEditor evs={{ HP: 252 }} ivs={{}} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "0 Atk / 0 Spe" }));
    expect(onChange).toHaveBeenCalledWith({ evs: { HP: 252 }, ivs: { Atk: 0, Spe: 0 } });
  });

  it("la barra del total siempre está y avisa (aria-live) solo al pasarse de 510", () => {
    const { rerender } = render(<EVEditor evs={{ HP: 252 }} ivs={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("progressbar", { name: "Total de EVs" })).toHaveAttribute("aria-valuenow", "252");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    rerender(<EVEditor evs={{ HP: 252, Atk: 252, Def: 252 }} ivs={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Te pasaste 246 EVs del máximo");
  });

  it("pinta el resumen (children) pegado a los EVs", () => {
    render(<EVEditor evs={{}} ivs={{}} onChange={vi.fn()}><p>Resumen</p></EVEditor>);
    expect(screen.getByText("Resumen")).toBeInTheDocument();
  });
});
