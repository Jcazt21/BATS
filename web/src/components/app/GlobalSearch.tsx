import { useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { searchSpecies } from "@/lib/dex/snapshot";
import { useDexEssentials, useLeaderboard } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface Result { key: string; label: string; kind: "Pokémon" | "Jugador"; to: string }

/**
 * Búsqueda global de pokémon y jugadores. Se abre con el botón o con la tecla `/` (si no se
 * está escribiendo en un campo). Abierta con el teclado no anima: quien busca así va rápido.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [byKeyboard, setByKeyboard] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      setByKeyboard(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Buscar" aria-keyshortcuts="/" onClick={() => { setByKeyboard(false); setOpen(true); }}>
        <Search />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className={cn("top-[20%] translate-y-0 gap-3 p-4 sm:max-w-md", byKeyboard && "data-open:animate-none! data-closed:animate-none!")}>
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          {/* Solo existe mientras está abierto: el dex y la clasificación no se piden hasta que se busca. */}
          <Panel onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Panel({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const listId = useId();
  const dex = useDexEssentials();
  const players = useLeaderboard();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Primero los que empiezan por lo escrito ("gar" → Garchomp antes que Gengar); el orden previo se respeta dentro de cada grupo.
    const species = dex.data
      ? searchSpecies(dex.data, q).sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q))).slice(0, 6)
      : [];
    const jugadores = (players.data ?? []).filter((p) => p.username.toLowerCase().includes(q)).slice(0, 6);
    return [
      ...species.map((s) => ({ key: `s-${s.name}`, label: s.name, kind: "Pokémon" as const, to: `/pokedex/${encodeURIComponent(s.name)}` })),
      ...jugadores.map((p) => ({ key: `j-${p.username}`, label: p.username, kind: "Jugador" as const, to: `/j/${encodeURIComponent(p.username)}` })),
    ];
  }, [query, dex.data, players.data]);

  function pick(r: Result | undefined) {
    if (!r) return;
    navigate(r.to);
    onDone();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus role="combobox" aria-expanded={results.length > 0} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-label="Buscar pokémon o jugador" placeholder="Buscar pokémon o jugador"
          value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
          className="h-11 w-full rounded-full border border-input bg-card pr-4 pl-10 text-subhead outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </div>
      {query.trim() && results.length === 0 && <p className="px-2 py-3 text-subhead text-muted-foreground">Sin resultados para “{query.trim()}”.</p>}
      <ul id={listId} role="listbox" aria-label="Resultados" className="flex max-h-72 flex-col overflow-y-auto">
        {results.map((r, i) => (
          <li
            key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}
            onPointerMove={() => setActive(i)} onClick={() => pick(r)}
            className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-subhead", i === active && "bg-muted")}
          >
            <span className="truncate">{r.label}</span>
            <span className="text-caption text-muted-foreground">{r.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
