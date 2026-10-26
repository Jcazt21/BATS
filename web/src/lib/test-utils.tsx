import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Renderiza con React Query (sin reintentos) y router en memoria. */
export function renderWithProviders(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const original = typeof window !== "undefined" ? window.matchMedia : undefined;

/** jsdom no trae matchMedia: lo simula y fija si el usuario pide menos movimiento. */
export function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/** Deshace `mockReducedMotion` (llamar en `afterEach`). */
export function restoreMatchMedia() {
  if (original) window.matchMedia = original;
  else delete (window as { matchMedia?: unknown }).matchMedia;
}

/** Abre un menú de Base UI con el teclado: en jsdom el clic no lo abre (no hay pointerType real). */
export async function abrirMenu(trigger: HTMLElement) {
  const { default: userEvent } = await import("@testing-library/user-event");
  trigger.focus();
  await userEvent.keyboard("{Enter}");
}
