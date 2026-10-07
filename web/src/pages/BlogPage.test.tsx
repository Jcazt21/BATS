import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { BlogPage } from "./BlogPage";

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

  it("estado vacío sin entradas", async () => {
    vi.spyOn(api, "getBlogPosts").mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Aún no hay novedades")).toBeInTheDocument();
  });
});
