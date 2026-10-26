import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

vi.mock("@/lib/session", () => ({ useSession: () => ({ session: null, loading: false }), signOut: vi.fn() }));
vi.mock("@/lib/queries", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ preference: "system", setPreference: vi.fn() }) }));
vi.mock("@/routes", () => ({ publicPages: [], preloadWhenIdle: () => () => {} }));
vi.mock("@/components/app/RouteOutlet", () => ({ RouteOutlet: () => <div /> }));
vi.mock("@/components/app/GlobalSearch", () => ({ GlobalSearch: () => <button>Buscar</button> }));
vi.mock("@/components/app/OfflineNotice", () => ({ OfflineNotice: () => null }));
vi.mock("@/components/SignInCard", () => ({ SignInCard: () => <div /> }));

const montar = (url = "/") => render(<MemoryRouter initialEntries={[url]}><AppShell /></MemoryRouter>);
const tabBar = () => screen.getAllByRole("navigation", { name: "Principal" }).find((n) => n.className.includes("md:hidden"))!;

beforeEach(() => {
  window.scrollTo = vi.fn();
  // jsdom no trae IntersectionObserver (el shell lo usa para el filo de la barra superior).
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AppShell · barra de pestañas móvil", () => {
  it("tiene como máximo 5 destinos con etiquetas cortas", () => {
    montar();
    const enlaces = within(tabBar()).getAllByRole("link");
    expect(enlaces.length).toBeLessThanOrEqual(5);
    for (const a of enlaces) expect(a.textContent!.trim().length).toBeLessThanOrEqual(9);
  });

  it("cada pestaña mide ≥44px (min-h-12 = 48px)", () => {
    montar();
    for (const a of within(tabBar()).getAllByRole("link")) expect(a).toHaveClass("min-h-12");
  });

  it("marca la pestaña activa con aria-current", () => {
    montar("/stats");
    const activos = within(tabBar()).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveAttribute("href", "/stats");
  });

  it("tocar la pestaña activa sube al inicio de la página", async () => {
    montar("/stats");
    await userEvent.click(within(tabBar()).getByRole("link", { name: /Stats/ }));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it("tocar otra pestaña no fuerza el scroll", async () => {
    montar("/stats");
    await userEvent.click(within(tabBar()).getByRole("link", { name: /Pokédex/ }));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("el Blog, que ya no está en la barra, sigue a un toque desde la cabecera móvil", () => {
    montar();
    const blog = screen.getAllByRole("link", { name: "Blog" });
    expect(blog.some((a) => a.className.includes("md:hidden"))).toBe(true);
  });

  it("la navegación de escritorio conserva los 6 destinos completos", () => {
    montar();
    const nav = screen.getAllByRole("navigation", { name: "Principal" }).find((n) => n.className.includes("md:flex"))!;
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Inicio", "Blog", "Estadísticas", "Pokédex", "Bans", "Mi equipo"]);
  });
});
