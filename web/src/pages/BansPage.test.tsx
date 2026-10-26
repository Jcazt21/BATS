import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BansPage } from "./BansPage";
import { BAN_RADAR_THRESHOLD_PCT } from "@/lib/ban";
import { leerFuente } from "@/styles/source";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({ ranking: {} as Q, status: {} as Q, candidates: {} as Q }));

vi.mock("@/components/ban/VoteFlow", () => ({ VoteFlow: () => <div data-testid="voteflow" /> }));
vi.mock("@/lib/queries", () => ({
  useActiveSeason: () => ({ data: { season_id: 1, season_name: "T1" } }),
  useBanStatus: () => st.status,
  useBanRanking: () => st.ranking,
  useBanCandidates: () => st.candidates,
}));

const renderPage = () => render(<MemoryRouter><BansPage /></MemoryRouter>);

beforeEach(() => {
  st.status = { isPending: false, data: { total_authorized: 8, total_voted: 3, total_votes_cast: 3, voting_open: true } };
  st.ranking = { isPending: false, data: [] };
  st.candidates = { isPending: false, data: [] };
});

describe("BansPage", () => {
  it("el orden es: estado compacto, tu voto, ranking, radar", () => {
    renderPage();
    const orden = [
      screen.getByRole("region", { name: "Estado de la votación" }),
      screen.getByTestId("voteflow"),
      screen.getByText("Ranking en vivo"),
      screen.getByRole("heading", { name: "Ban Radar" }),
    ];
    for (let i = 0; i < orden.length - 1; i++) {
      expect(orden[i].compareDocumentPosition(orden[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("el estado de la votación es compacto: una sola línea de texto, no 3 mosaicos", () => {
    renderPage();
    const estado = screen.getByRole("region", { name: "Estado de la votación" });
    expect(estado).toHaveTextContent("3/8");
    expect(estado).toHaveTextContent("Abierta");
  });

  it("mientras carga el ranking muestra esqueleto, no 'Aún no hay votos'", () => {
    st.ranking = { isPending: true };
    renderPage();
    expect(screen.queryByText("Aún no hay votos")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("sin votos (ya cargó) sí dice 'Aún no hay votos'", () => {
    renderPage();
    expect(screen.getByText("Aún no hay votos")).toBeInTheDocument();
  });

  it("los títulos de sección comparten estilo (todos como el de Group)", () => {
    renderPage();
    for (const nombre of ["Tu voto", "Ban Radar", "Ranking en vivo"]) {
      expect(screen.getByRole("heading", { name: nombre })).toHaveClass("uppercase", "text-footnote");
    }
  });

  it("el umbral sale de una constante compartida, no de un 70 escrito a mano", () => {
    renderPage();
    expect(screen.getAllByText(new RegExp(`${BAN_RADAR_THRESHOLD_PCT} %`)).length).toBeGreaterThan(0);
    expect(leerFuente("pages/BansPage.tsx")).not.toMatch(/\b70 %/);
  });

  it("el filtro de batallas dice su unidad", () => {
    renderPage();
    expect(screen.getByText(/batallas mínimas/)).toBeInTheDocument();
  });
});
