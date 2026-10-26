import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { BlogPage } from "./BlogPage";
import { leerFuente } from "@/styles/source";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><BlogPage /></MemoryRouter></QueryClientProvider>);
}

describe("BlogPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lista las entradas enlazando a su página", async () => {
    vi.spyOn(api, "getBlogPosts").mockResolvedValue([
      { post_id: 1, slug: "temporada-4", title: "Temporada 4", excerpt: "Arranca el lunes.", author: "Jean", published_at: "2026-10-07T12:00:00Z" },
    ]);
    renderPage();
    const link = await screen.findByRole("link", { name: /Temporada 4/ });
    expect(link).toHaveAttribute("href", "/blog/temporada-4");
    expect(screen.getByText("Arranca el lunes.")).toBeInTheDocument();
  });

  it("destaca la más reciente y lista el resto en «Más entradas»", async () => {
    vi.spyOn(api, "getBlogPosts").mockResolvedValue([
      { post_id: 2, slug: "nueva", title: "Nueva", excerpt: "", author: null, published_at: "2026-10-08T12:00:00Z" },
      { post_id: 1, slug: "vieja", title: "Vieja", excerpt: "", author: null, published_at: "2026-10-01T12:00:00Z" },
    ]);
    renderPage();
    const spotlight = await screen.findByRole("link", { name: /Lo último.*Nueva/ });
    expect(spotlight).toHaveAttribute("href", "/blog/nueva");
    expect(screen.getByRole("heading", { name: "Más entradas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vieja/ })).toHaveAttribute("href", "/blog/vieja");
  });

  it("estado vacío sin entradas", async () => {
    vi.spyOn(api, "getBlogPosts").mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Aún no hay novedades")).toBeInTheDocument();
  });

  it("mientras carga muestra un estado de carga anunciado (role=status)", () => {
    vi.spyOn(api, "getBlogPosts").mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });

  it("el destacado no usa blur ni márgenes negativos; el resto de filas tienen foco visible", async () => {
    vi.spyOn(api, "getBlogPosts").mockResolvedValue([
      { post_id: 2, slug: "nueva", title: "Nueva", excerpt: "", author: null, published_at: "2026-10-08T12:00:00Z" },
      { post_id: 1, slug: "vieja", title: "Vieja", excerpt: "", author: null, published_at: "2026-10-01T12:00:00Z" },
    ]);
    renderPage();
    const destacado = await screen.findByRole("link", { name: /Lo último.*Nueva/ });
    expect(destacado.innerHTML).not.toMatch(/blur-3xl/);
    const fila = screen.getByRole("link", { name: /Vieja/ });
    expect(fila.className).not.toMatch(/-mx-3/);
    expect(fila.className).toMatch(/focus-visible:ring-2/);
  });

  it("el movimiento en hover solo aplica con puntero fino", () => {
    const src = leerFuente("pages/BlogPage.tsx");
    expect(src).not.toMatch(/(?<!\)\]:)group-hover:translate/);
    expect(src).toMatch(/\[@media\(hover:hover\)_and_\(pointer:fine\)\]:group-hover:translate-x-0\.5/);
  });
});
