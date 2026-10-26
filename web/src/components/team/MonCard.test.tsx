import { render, screen, waitFor, within } from "@testing-library/react";
import { AnimatePresence } from "motion/react";
import { leerFuente } from "@/styles/source";
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

describe("MonCard · entrada y salida", () => {
  const lista = (names: string[]) => (
    <ul>
      <AnimatePresence initial={false}>
        {names.map((n) => <MonCard key={n} mon={{ name: n }} />)}
      </AnimatePresence>
    </ul>
  );

  it("al quitar un pokémon se queda en el DOM hasta terminar la animación de salida", async () => {
    const { rerender } = render(lista(["Dragonite", "Gengar"]));
    rerender(lista(["Dragonite"]));
    expect(screen.getByText("Gengar")).toBeInTheDocument(); // aún sale
    await waitFor(() => expect(screen.queryByText("Gengar")).not.toBeInTheDocument());
    expect(screen.getByText("Dragonite")).toBeInTheDocument();
  });

  it("la tarjeta se reordena sin deformarse: layout=\"position\" en el fuente", () => {
    expect(leerFuente("components/team/MonCard.tsx")).toMatch(/layout="position"/);
  });
});
