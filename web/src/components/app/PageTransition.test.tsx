import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { PageTransition } from "./PageTransition";

const reducido = vi.hoisted(() => ({ valor: false }));
vi.mock("@/lib/motion", async (orig) => ({ ...(await orig<typeof import("@/lib/motion")>()), useReducedMotion: () => reducido.valor }));

/** Un botón por destino: se navega con clics, como haría el usuario (sin guardar el navigate en una variable global). */
function Controles() {
  const navigate = useNavigate();
  return (
    <>
      {["/stats", "/pokedex", "/stats/pokemon/Gengar", "/pokedex/gengar"].map((to) => <button key={to} onClick={() => navigate(to)}>{`ir ${to}`}</button>)}
      <button onClick={() => navigate(-1)}>atrás</button>
    </>
  );
}
const ir = (to: string) => act(() => { fireEvent.click(screen.getByText(`ir ${to}`)); });
const atras = () => act(() => { fireEvent.click(screen.getByText("atrás")); });

const montar = (inicial: string) =>
  render(<MemoryRouter initialEntries={[inicial]}><Controles /><PageTransition><p>pagina</p></PageTransition></MemoryRouter>);
const estilo = () => screen.getByText("pagina").parentElement!.style;

describe("PageTransition", () => {
  it("la primera carga no se anima", () => {
    montar("/stats");
    expect(estilo().opacity).not.toBe("0");
  });

  it("entre rutas hermanas de primer nivel no se anima", () => {
    montar("/stats");
    ir("/pokedex");
    expect(estilo().opacity).not.toBe("0");
  });

  it("al entrar a un detalle sí se anima (fundido + ascenso)", () => {
    reducido.valor = false;
    montar("/stats");
    ir("/stats/pokemon/Gengar");
    expect(estilo().opacity).toBe("0");
    expect(estilo().transform).toMatch(/translateY\(6px\)/);
  });

  it("con reduced-motion el detalle entra solo con fundido", () => {
    reducido.valor = true;
    montar("/stats");
    ir("/stats/pokemon/Gengar");
    expect(estilo().opacity).toBe("0");
    expect(estilo().transform).not.toMatch(/translateY\(6px\)/);
    reducido.valor = false;
  });

  it("al volver con atrás (POP) no se anima", () => {
    montar("/stats");
    ir("/stats/pokemon/Gengar");
    atras();
    expect(estilo().opacity).not.toBe("0");
  });

  it("al salir de un detalle hacia su lista tampoco", () => {
    montar("/stats/pokemon/Gengar");
    ir("/stats");
    expect(estilo().opacity).not.toBe("0");
  });

  it("abrir la ficha-modal de la Pokédex no remonta ni anima la grilla", () => {
    reducido.valor = false;
    montar("/pokedex");
    const antes = screen.getByText("pagina");
    ir("/pokedex/gengar");
    expect(screen.getByText("pagina")).toBe(antes);
    expect(estilo().opacity).not.toBe("0");
  });
});
