import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { abrirMenu, mockViewport, restoreMatchMedia } from "@/lib/test-utils";
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
  const ordenar = () => screen.getByRole("group", { name: "Ordenar por" });
  const nombresTarjetas = () =>
    within(screen.getByRole("list", { name: "Pokémon" })).getAllByRole("listitem").map((li) => li.textContent?.slice(0, 9));
  const criterio = () => within(ordenar()).getByRole("button", { name: /Ordenar por:/ });
  const invertir = () => within(ordenar()).getByRole("button", { name: /Invertir orden/ });

  it("sin la opción no hay selector de orden", () => {
    montar();
    expect(screen.queryByRole("group", { name: "Ordenar por" })).not.toBeInTheDocument();
  });

  it("es un solo control en una línea (sin chips que desborden) con el criterio actual", async () => {
    montar({ mobileSort: true, defaultSort: { key: "wr", dir: "desc" } });
    expect(within(ordenar()).queryAllByRole("radio")).toHaveLength(0);
    expect(criterio()).toHaveTextContent("Win rate");
    await abrirMenu(criterio());
    const opciones = await screen.findAllByRole("menuitemradio");
    expect(opciones.map((o) => o.textContent)).toEqual(["Nombre", "Win rate"]);
    expect(screen.getByRole("menuitemradio", { name: "Win rate" })).toHaveAttribute("aria-checked", "true");
  });

  it("elegir otro criterio reordena las tarjetas (descendente)", async () => {
    montar({ mobileSort: true, defaultSort: { key: "wr", dir: "desc" } });
    expect(nombresTarjetas()[0]).toMatch(/Dragonite/);
    await abrirMenu(criterio());
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Nombre" }));
    expect(nombresTarjetas()[0]).toMatch(/Gengar/);
    expect(criterio()).toHaveTextContent("Nombre");
  });

  it("el botón de dirección invierte el orden", async () => {
    montar({ mobileSort: true, defaultSort: { key: "wr", dir: "desc" } });
    expect(invertir()).toHaveAccessibleName(/mayor primero/);
    await userEvent.click(invertir());
    expect(nombresTarjetas()[0]).toMatch(/Gengar/); // ascendente: 40% primero
    expect(invertir()).toHaveAccessibleName(/menor primero/);
  });

  it("los controles miden ≥44px de alto", () => {
    montar({ mobileSort: true, defaultSort: { key: "wr", dir: "desc" } });
    expect(criterio().className).toMatch(/\bh-11\b/);
    expect(invertir().className).toMatch(/\bsize-11\b/);
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
