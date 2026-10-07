import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { BlogAdminPage } from "./BlogAdminPage";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><BlogAdminPage /></MemoryRouter></QueryClientProvider>);
}

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

  it("sube un .md como borrador con el título detectado", async () => {
    vi.spyOn(api, "getAdminBlogPosts").mockResolvedValue([]);
    const create = vi.spyOn(api, "createBlogPost").mockResolvedValue({
      post_id: 1, slug: "hola", title: "Hola liga", excerpt: "", author: "a", published_at: null,
      is_published: false, created_at: null, updated_at: null,
    });
    renderPage();
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("Archivo .md"), new File(["# Hola liga\n\nTexto"], "hola.md", { type: "text/markdown" }));
    expect(await screen.findByDisplayValue("Hola liga")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    // React Query v5 añade el contexto como segundo argumento de mutationFn: se comprueba solo el payload.
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toEqual({ title: "Hola liga", content_md: "# Hola liga\n\nTexto", publish: false });
  });

  it("rechaza un archivo que no es .md sin llamar a la API", async () => {
    vi.spyOn(api, "getAdminBlogPosts").mockResolvedValue([]);
    const create = vi.spyOn(api, "createBlogPost");
    renderPage();
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText("Archivo .md"), new File(["x"], "x.txt"));
    expect(await screen.findByText("Elige un archivo .md.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
