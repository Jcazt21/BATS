import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { BlogAdminPage } from "./BlogAdminPage";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><BlogAdminPage /></MemoryRouter></QueryClientProvider>);
}

const post = (over: Partial<api.AdminBlogPost> = {}): api.AdminBlogPost => ({
  post_id: 7, slug: "temporada-4", title: "Temporada 4", excerpt: "", author: "a",
  published_at: "2026-10-07T12:00:00Z", is_published: true, created_at: null, updated_at: null, ...over,
});

describe("BlogAdminPage", () => {
  // jsdom no trae matchMedia; ResponsiveSheet lo usa para elegir entre hoja y diálogo.
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false, media: query, addEventListener() {}, removeEventListener() {},
    }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pega el Markdown y publica; el título sale del primer # y el front matter se quita", async () => {
    vi.spyOn(api, "getAdminBlogPosts").mockResolvedValue([]);
    const create = vi.spyOn(api, "createBlogPost").mockResolvedValue(post({ post_id: 1, title: "Hola liga" }));
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Contenido en Markdown"));
    await user.paste("---\ntags: [liga]\n---\n# Hola liga\n\nTexto");
    expect(screen.getByLabelText("Título")).toHaveValue("Hola liga");
    await user.click(screen.getByRole("button", { name: "Publicar" }));
    // React Query v5 añade el contexto como segundo argumento de mutationFn: se comprueba solo el payload.
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toEqual({ title: "Hola liga", content_md: "# Hola liga\n\nTexto", publish: true });
  });

  it("importa un .md al editor y lo guarda como borrador", async () => {
    vi.spyOn(api, "getAdminBlogPosts").mockResolvedValue([]);
    const create = vi.spyOn(api, "createBlogPost").mockResolvedValue(post({ post_id: 1, title: "Hola liga" }));
    renderPage();
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("Importar archivo .md"), new File(["# Hola liga\n\nTexto"], "hola.md", { type: "text/markdown" }));
    expect(await screen.findByDisplayValue("Hola liga")).toBeInTheDocument();
    expect(screen.getByLabelText("Contenido en Markdown")).toHaveValue("# Hola liga\n\nTexto");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toEqual({ title: "Hola liga", content_md: "# Hola liga\n\nTexto", publish: false });
  });

  it("edita una entrada en una hoja y envía solo lo que cambió", async () => {
    vi.spyOn(api, "getAdminBlogPosts").mockResolvedValue([post()]);
    vi.spyOn(api, "getAdminBlogPost").mockResolvedValue(post({ content_md: "# Temporada 4\n\nCon errata" }));
    const update = vi.spyOn(api, "updateBlogPost").mockResolvedValue(post());
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Editar Temporada 4" }));
    const sheet = await screen.findByRole("dialog");
    const content = await within(sheet).findByLabelText("Contenido en Markdown");
    expect(content).toHaveValue("# Temporada 4\n\nCon errata");
    await user.clear(content);
    await user.click(content);
    await user.paste("# Temporada 4\n\nSin errata");
    // Editar una entrada no cambia su título solo porque cambie el primer #.
    expect(within(sheet).getByLabelText("Título")).toHaveValue("Temporada 4");
    await user.click(within(sheet).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toBe(7);
    expect(update.mock.calls[0][1]).toEqual({ content_md: "# Temporada 4\n\nSin errata" });
  });

  it("rechaza un archivo que no es .md sin llamar a la API", async () => {
    vi.spyOn(api, "getAdminBlogPosts").mockResolvedValue([]);
    const create = vi.spyOn(api, "createBlogPost");
    renderPage();
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText("Importar archivo .md"), new File(["x"], "x.txt"));
    expect(await screen.findByText("Elige un archivo .md.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
