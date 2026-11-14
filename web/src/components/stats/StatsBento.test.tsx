import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StatsBento, type StatsBentoProps } from "./StatsBento";
import { num, pct } from "@/lib/format";
import { mockViewport } from "@/lib/test-utils";

const base: StatsBentoProps = {
  summary: { total_battles: 12, total_players: 4, avg_turns: 18.5, top_win_rate: 75 } as StatsBentoProps["summary"],
  leaderboard: [
    { username: "ash", total_battles: 6, wins: 4, losses: 1, ties: 1, win_rate_pct: 66.7, total_survivors: 9, form: [], streak: { type: null, length: 0 } },
  ],
  perDay: { days: [{ date: "2026-11-01", battles: 2, total: 2 }, { date: "2026-11-02", battles: 1, total: 3 }], last_7: 3, prev_7: 0 },
  topPokemon: { species: "Scizor-Mega", used: 8, pick_pct: 40, brought: 9, bring_pct: 45, win_rate_pct: 62.5, avg_mvp: 2, avg_kills: 1, survival_pct: 50 },
  mvp: { species: "Gengar", player: "misty", total_mvp_score: 14.5, total_kills: 6, final_hits: 2, battles_played: 6, avg_mvp_per_battle: 2.4 },
  temporada: "active",
  dexNum: () => undefined,
};

const renderBento = (props: Partial<StatsBentoProps> = {}) =>
  render(<MemoryRouter><StatsBento {...base} {...props} /></MemoryRouter>);

describe("StatsBento · escritorio", () => {
  beforeEach(() => mockViewport(true));

  it("muestra batallas, el pokémon más usado enlazado a su ficha y el MVP", () => {
    renderBento();
    const usado = screen.getByRole("region", { name: "Pokémon más usado" });
    expect(within(usado).getByRole("link", { name: /Scizor-Mega/ })).toHaveAttribute("href", "/stats/pokemon/Scizor-Mega");
    expect(within(usado).getByText(pct(40, 1))).toBeInTheDocument();
    const mvp = screen.getByRole("region", { name: "MVP de la temporada" });
    expect(within(mvp).getByText("Gengar")).toBeInTheDocument();
    expect(within(mvp).getByText(/misty/)).toBeInTheDocument();
    expect(within(mvp).getByText(num(14.5, 1))).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Batallas" })).toHaveTextContent("12");
    const cifras = screen.getByRole("region", { name: "Cifras de la liga" });
    expect(cifras).toHaveTextContent("4");
    expect(cifras).toHaveTextContent(num(18.5, 1));
    expect(cifras).toHaveTextContent("mín. 3 batallas");
  });

  it("con otra temporada, el enlace a la ficha la conserva", () => {
    renderBento({ temporada: 2 });
    expect(screen.getByRole("link", { name: /Scizor-Mega/ })).toHaveAttribute("href", "/stats/pokemon/Scizor-Mega?temporada=2");
  });

  it("temporada sin batallas: textos vacíos y ningún NaN ni undefined", () => {
    const { container } = renderBento({
      summary: { total_battles: 0, total_players: 0, avg_turns: null, top_win_rate: null } as unknown as StatsBentoProps["summary"],
      leaderboard: [], perDay: { days: [], last_7: 0, prev_7: 0 }, topPokemon: undefined, mvp: undefined,
    });
    expect(screen.getByText("Aún no hay batallas.")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay jugadores.")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay pokémon.")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay MVP.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe("StatsBento · teléfono", () => {
  beforeEach(() => mockViewport(false));

  it("muestra cifras chicas y destacados compactos, sin la curva ni las barras", () => {
    renderBento({ temporada: 2 });
    const bento = screen.getByRole("group", { name: "Resumen de la temporada" });
    expect(within(bento).getByRole("region", { name: "Batallas" })).toHaveTextContent("12");
    expect(within(bento).getByRole("region", { name: "Batallas" })).toHaveTextContent("esta semana");
    expect(within(bento).getByRole("region", { name: "Turnos por batalla" })).toHaveTextContent(num(18.5, 1));
    expect(within(bento).getByRole("link", { name: /Scizor-Mega/ })).toHaveAttribute("href", "/stats/pokemon/Scizor-Mega?temporada=2");
    expect(within(bento).getByRole("region", { name: "MVP de la temporada" })).toHaveTextContent("misty");
    expect(screen.queryByRole("img", { name: /Batallas acumuladas|Win rate por jugador/ })).not.toBeInTheDocument();
  });

  it("temporada sin batallas: ningún NaN ni undefined", () => {
    const { container } = renderBento({
      summary: { total_battles: 0, total_players: 0, avg_turns: null, top_win_rate: null } as unknown as StatsBentoProps["summary"],
      leaderboard: [], perDay: { days: [], last_7: 0, prev_7: 0 }, topPokemon: undefined, mvp: undefined,
    });
    expect(screen.getByText("Aún no hay pokémon.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
});
