import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonPeople } from "./SeasonPeople";

const getPlayerAccounts = vi.fn();
const getSeasonWhitelist = vi.fn();
const addSeasonWhitelist = vi.fn();

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  getPlayerAccounts: (...a: unknown[]) => getPlayerAccounts(...a),
  getSeasonWhitelist: (...a: unknown[]) => getSeasonWhitelist(...a),
  getSeasonVotes: () => Promise.resolve([]),
  addSeasonWhitelist: (...a: unknown[]) => addSeasonWhitelist(...a),
}));

const account = (username: string, email: string) => ({
  account_id: username.length, email, username, is_admin: false,
  user_id: null, is_linked: false, created_at: "2026-01-01T00:00:00Z",
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SeasonPeople seasonId={1} />
    </QueryClientProvider>,
  );
}

/** El selector arranca desactivado ("Cargando jugadores…"): espera a que lleguen las cuentas. */
async function picker() {
  const box = await screen.findByRole("combobox");
  await waitFor(() => expect(box).toBeEnabled());
  return box;
}

beforeEach(() => {
  vi.clearAllMocks();
  getPlayerAccounts.mockResolvedValue([
    account("Jcazt69", "jean@example.com"),
    account("Ritsu", "ritsu@example.com"),
    account("Yaboi", "yaboi@example.com"),
  ]);
  getSeasonWhitelist.mockResolvedValue([
    { voter_hash: "h1", username: "Ritsu", added_at: "2026-01-01T00:00:00Z", voted: false },
  ]);
  addSeasonWhitelist.mockResolvedValue({ ok: true });
});

describe("SeasonPeople · whitelist", () => {
  it("ofrece las cuentas registradas y omite las que ya están dentro", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await picker());
    expect(await screen.findByRole("option", { name: /Jcazt69/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Yaboi/ })).toBeInTheDocument();
    // Ritsu ya está en la whitelist: no se puede volver a agregar (sería un 409).
    expect(screen.queryByRole("option", { name: /ritsu@example\.com/ })).not.toBeInTheDocument();
  });

  it("busca también por email", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(await picker(), "yaboi@");
    expect(await screen.findByRole("option", { name: /Yaboi/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Jcazt69/ })).not.toBeInTheDocument();
  });

  it("agrega el username exacto de la cuenta elegida", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await picker());
    await user.click(await screen.findByRole("option", { name: /Jcazt69/ }));
    expect(await screen.findByText(/Vas a agregar a Jcazt69/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(addSeasonWhitelist).toHaveBeenCalledWith(1, "jcazt69"));
  });

  it("marca en la whitelist a quien no tiene cuenta en la liga", async () => {
    getSeasonWhitelist.mockResolvedValue([
      { voter_hash: "h1", username: "Ritsu", added_at: "2026-01-01T00:00:00Z", voted: false },
      { voter_hash: "h2", username: "Jcaz21", added_at: "2026-01-01T00:00:00Z", voted: false },
    ]);
    setup();
    expect(await screen.findByText("Sin cuenta")).toBeInTheDocument();
    expect(screen.getByText(/no va a poder votar/)).toBeInTheDocument();
    expect(screen.getByText("Aún no vota")).toBeInTheDocument(); // Ritsu sí tiene cuenta
  });

  it("desactiva el selector cuando no hay cuentas registradas", async () => {
    getPlayerAccounts.mockResolvedValue([]);
    getSeasonWhitelist.mockResolvedValue([]);
    setup();
    expect(await screen.findByText(/No hay cuentas registradas/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  });
});
