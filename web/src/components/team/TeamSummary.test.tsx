import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamSummary } from "./TeamSummary";

const mons = [
  { name: "Dragonite", types: "Dragon / Flying" },
  { name: "Garchomp", types: "Dragon / Ground" },
];

describe("TeamSummary", () => {
  it("muestra 'Válido' cuando Showdown aprobó el equipo", () => {
    render(<TeamSummary mons={mons} validation={{ state: "ok", errors: [], checked_at: null }} />);
    expect(screen.getByText("Válido")).toBeInTheDocument();
  });

  it("muestra el número de errores (singular y plural)", () => {
    const { rerender } = render(<TeamSummary mons={mons} validation={{ state: "errors", errors: ["a"], checked_at: null }} />);
    expect(screen.getByText("1 error")).toBeInTheDocument();
    rerender(<TeamSummary mons={mons} validation={{ state: "errors", errors: ["a", "b"], checked_at: null }} />);
    expect(screen.getByText("2 errores")).toBeInTheDocument();
  });

  it("pendiente de revisión no se presenta como válido ni como error", () => {
    render(<TeamSummary mons={mons} validation={{ state: "pending", errors: [], checked_at: null }} />);
    expect(screen.getByText("Pendiente de revisión")).toBeInTheDocument();
    expect(screen.queryByText("Válido")).not.toBeInTheDocument();
  });

  it("lista cada tipo del equipo una sola vez con TypeBadge", () => {
    const { container } = render(<TeamSummary mons={mons} validation={{ state: "ok", errors: [], checked_at: null }} />);
    const grupo = screen.getByRole("list", { name: "Tipos del equipo" });
    expect(grupo.querySelectorAll("li")).toHaveLength(3); // Dragon, Flying, Ground
    expect(container.querySelectorAll(".type-dragon")).toHaveLength(1);
  });

  it("vacío: dice que no hay pokémon", () => {
    render(<TeamSummary mons={[]} validation={{ state: "pending", errors: [], checked_at: null }} />);
    expect(screen.getByText("Sin pokémon todavía")).toBeInTheDocument();
  });

  it("cargando: esqueleto con role=status", () => {
    render(<TeamSummary loading mons={[]} validation={undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });
});
