import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { mockViewport, restoreMatchMedia } from "@/lib/test-utils";
import { DataList, type Column } from "./DataList";

// Solo se monta una presentación: por defecto la tabla (ancha); las tarjetas piden `mockViewport(false)`.
beforeEach(() => mockViewport(true));
afterEach(() => restoreMatchMedia());

interface Row { name: string; wr: number }
const cols: Column<Row>[] = [
  { key: "name", header: "Nombre", primary: true, sortValue: (r) => r.name, cell: (r) => r.name },
  { key: "wr", header: "Win rate", align: "right", sortValue: (r) => r.wr, cell: (r) => `${r.wr}%` },
];
const rows: Row[] = [{ name: "Gengar", wr: 40 }, { name: "Dragonite", wr: 60 }];

function montar(extra: Partial<React.ComponentProps<typeof DataList<Row>>> = {}) {
  return render(
    <MemoryRouter>
      <DataList caption="Pokémon" rows={rows} columns={cols} rowKey={(r) => r.name} {...extra} />
    </MemoryRouter>,
  );
}

describe("DataList · filas como enlaces", () => {
  it("con rowHref la celda de nombre es un <a href> real (clic medio / Ctrl+clic abren pestaña)", () => {
    montar({ rowHref: (r) => `/stats/pokemon/${r.name}` });
    const tabla = screen.getByRole("table");
    const enlace = within(tabla).getByRole("link", { name: "Dragonite" });
    expect(enlace).toHaveAttribute("href", "/stats/pokemon/Dragonite");
  });

  it("en las tarjetas (móvil) el nombre también es un enlace real", () => {
    mockViewport(false);
    montar({ rowHref: (r) => `/stats/pokemon/${r.name}` });
    const tarjetas = screen.getByRole("list", { name: "Pokémon" });
    expect(within(tarjetas).getByRole("link", { name: "Dragonite" })).toHaveAttribute("href", "/stats/pokemon/Dragonite");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("en pantalla ancha no se montan las tarjetas (no se duplican las filas)", () => {
    montar({ rowHref: (r) => `/stats/pokemon/${r.name}` });
    expect(screen.queryByRole("list", { name: "Pokémon" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Dragonite" })).toHaveLength(1);
  });

  it("el enlace no es una segunda parada de tabulador (la fila ya lo es)", () => {
    montar({ rowHref: (r) => `/p/${r.name}`, onRowClick: () => {} });
    expect(within(screen.getByRole("table")).getByRole("link", { name: "Dragonite" })).toHaveAttribute("tabindex", "-1");
  });

  it("un clic en el enlace no dispara además onRowClick (no se navega dos veces)", async () => {
    const onRowClick = vi.fn();
    montar({ rowHref: (r) => `/p/${r.name}`, onRowClick });
    await userEvent.click(within(screen.getByRole("table")).getByRole("link", { name: "Dragonite" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("un clic en otra celda de la fila sí dispara onRowClick", async () => {
    const onRowClick = vi.fn();
    montar({ rowHref: (r) => `/p/${r.name}`, onRowClick });
    await userEvent.click(within(screen.getByRole("table")).getByText("60%"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });
});

describe("DataList · teclado", () => {
  it.each(["{Enter}", " "])("en la tabla, %j activa la fila", async (tecla) => {
    const onRowClick = vi.fn();
    montar({ onRowClick });
    const fila = within(screen.getByRole("table")).getAllByRole("row")[1];
    fila.focus();
    await userEvent.keyboard(tecla);
    expect(onRowClick).toHaveBeenCalledOnce();
  });

  it.each(["{Enter}", " "])("en las tarjetas, %j activa la tarjeta", async (tecla) => {
    mockViewport(false);
    const onRowClick = vi.fn();
    montar({ onRowClick });
    const tarjeta = within(screen.getByRole("list", { name: "Pokémon" })).getAllByRole("button")[0];
    tarjeta.focus();
    await userEvent.keyboard(tecla);
    expect(onRowClick).toHaveBeenCalledOnce();
  });
});

describe("DataList · entrada escalonada", () => {
  const muchas = Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, wr: i }));
  const filasTabla = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sin pasar por carga no hay animación de filas", () => {
    montar({ rows: muchas });
    for (const f of filasTabla()) expect(f.className).not.toMatch(/animate-in/);
  });

  it("tras cargar, las primeras 8 filas entran con 30ms de desfase y el resto no", () => {
    const { rerender } = montar({ rows: [], loading: true });
    rerender(
      <MemoryRouter>
        <DataList caption="Pokémon" rows={muchas} columns={cols} rowKey={(r) => r.name} />
      </MemoryRouter>,
    );
    const f = filasTabla();
    expect(f[0]).toHaveClass("animate-in", "fade-in-0");
    expect(f[0].style.animationDelay).toBe("0ms");
    expect(f[7].style.animationDelay).toBe("210ms");
    expect(f[8].className).not.toMatch(/animate-in/);
  });

  it("al ordenar o filtrar después de la primera carga no se vuelve a animar", async () => {
    const { rerender } = montar({ rows: [], loading: true });
    rerender(
      <MemoryRouter>
        <DataList caption="Pokémon" rows={muchas} columns={cols} rowKey={(r) => r.name} />
      </MemoryRouter>,
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.click(screen.getByRole("button", { name: /Win rate/ }));
    for (const fila of filasTabla()) expect(fila.className).not.toMatch(/animate-in/);
  });
});

describe("DataList · orden en móvil (mobileSort)", () => {
  beforeEach(() => mockViewport(false));
  const ordenar = () => screen.getByRole("radiogroup", { name: "Ordenar por" });
  const nombresTarjetas = () =>
    within(screen.getByRole("list", { name: "Pokémon" })).getAllByRole("listitem").map((li) => li.textContent?.slice(0, 9));

  it("sin la opción no hay selector de orden", () => {
    montar();
    expect(screen.queryByRole("radiogroup", { name: "Ordenar por" })).not.toBeInTheDocument();
  });

  it("muestra un chip por columna ordenable, con el orden actual marcado", () => {
    montar({ mobileSort: true, defaultSort: { key: "wr", dir: "desc" } });
    const chips = within(ordenar()).getAllByRole("radio");
    expect(chips.map((c) => c.textContent)).toEqual(["Nombre", "Win rate"]);
    expect(within(ordenar()).getByRole("radio", { name: /Win rate/ })).toBeChecked();
  });

  it("elegir un chip reordena las tarjetas", async () => {
    montar({ mobileSort: true, defaultSort: { key: "wr", dir: "desc" } });
    expect(nombresTarjetas()[0]).toMatch(/Dragonite/);
    await userEvent.click(within(ordenar()).getByRole("radio", { name: "Nombre" })); // nuevo criterio: descendente
    expect(nombresTarjetas()[0]).toMatch(/Gengar/);
  });

  it("pulsar el chip activo invierte la dirección", async () => {
    montar({ mobileSort: true, defaultSort: { key: "wr", dir: "desc" } });
    await userEvent.click(within(ordenar()).getByRole("radio", { name: /Win rate/ }));
    expect(nombresTarjetas()[0]).toMatch(/Gengar/); // ascendente: 40% primero
  });

  it("cada chip mide ≥44px de área táctil", () => {
    montar({ mobileSort: true });
    for (const chip of within(ordenar()).getAllByRole("radio")) expect(chip.className).toMatch(/before:-inset-y-/);
  });
});

describe("DataList · mobileRow", () => {
  type R = { id: string; n: number };
  const cols: Column<R>[] = [
    { key: "id", header: "Nombre", primary: true, cell: (r) => r.id },
    { key: "n", header: "Número", cell: (r) => r.n },
  ];

  it("en el teléfono usa la fila compacta en vez de la tarjeta etiqueta/valor", () => {
    mockViewport(false);
    render(<DataList caption="Lista" rows={[{ id: "a", n: 1 }]} columns={cols} rowKey={(r) => r.id}
      mobileRow={(r) => <p>compacta {r.id}-{r.n}</p>} />);
    const lista = screen.getByRole("list", { name: "Lista" });
    expect(within(lista).getByText("compacta a-1")).toBeInTheDocument();
    expect(within(lista).queryByText("Número")).not.toBeInTheDocument();
  });

  it("en escritorio la ignora y muestra la tabla", () => {
    render(<DataList caption="Lista" rows={[{ id: "a", n: 1 }]} columns={cols} rowKey={(r) => r.id}
      mobileRow={(r) => <p>compacta {r.id}</p>} />);
    expect(screen.getByRole("table", { name: "Lista" })).toBeInTheDocument();
    expect(screen.queryByText("compacta a")).not.toBeInTheDocument();
  });
});
