import { useState } from "react";
import { Link } from "react-router-dom";
import { PokemonArtwork } from "@/components/app/PokemonArtwork";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/States";
import MagicBento from "@/components/effects/MagicBento";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import type { HeadToHead as H2H, LeaderboardEntry } from "@/lib/api";
import { haceCuanto } from "@/lib/format";
import { useHeadToHead } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Killer = H2H["top_killer"]["a"];

/** Pareja inicial: el jugador con sesión contra el primero de la clasificación que no sea él; si no, 1.º contra 2.º. */
function parejaInicial(ids: string[], me?: string): [string, string] {
  const yo = me?.toLowerCase();
  if (yo && ids.includes(yo)) return [yo, ids.find((id) => id !== yo)!];
  return [ids[0], ids[1]];
}

/** Historial directo entre dos jugadores de la clasificación (misma temporada que el resto de la página). */
export function HeadToHead({ players, me, season, dexNum }: {
  players: LeaderboardEntry[];
  me?: string;
  season?: number | null;
  dexNum?: (species: string) => number | undefined;
}) {
  const ids = players.map((p) => p.username.toLowerCase());
  const nombres = new Map(players.map((p) => [p.username.toLowerCase(), p.username]));
  const [elegidos, setElegidos] = useState<{ a?: string; b?: string }>({});
  const [ini, fin] = ids.length >= 2 ? parejaInicial(ids, me) : [undefined, undefined];
  const a = elegidos.a && ids.includes(elegidos.a) ? elegidos.a : ini;
  let b = elegidos.b && ids.includes(elegidos.b) ? elegidos.b : fin;
  if (b === a) b = ids.find((id) => id !== a);
  const q = useHeadToHead(a, b, season);

  if (ids.length < 2) return null;

  const opciones = (excluir?: string): ComboboxItem[] =>
    ids.filter((id) => id !== excluir).map((id) => ({ id, label: nombres.get(id) ?? id }));
  const d = q.data;
  const nombre = (id?: string | null) => (id ? nombres.get(id) ?? id : "");

  const contenido = (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-title3">Cara a cara</h2>
        <p className="text-footnote text-muted-foreground">Historial directo</p>
      </div>

      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Combobox ariaLabel="Jugador A" items={opciones(b)} value={a ?? null} onChange={(id) => setElegidos((e) => ({ ...e, a: id }))}
          placeholder="Busca un jugador" emptyText="Ningún jugador con ese nombre" className="w-full" inputClassName="h-11 rounded-2xl px-4" />
        <span aria-hidden="true" className="text-center text-footnote font-semibold text-muted-foreground">vs</span>
        <Combobox ariaLabel="Jugador B" items={opciones(a)} value={b ?? null} onChange={(id) => setElegidos((e) => ({ ...e, b: id }))}
          placeholder="Busca un jugador" emptyText="Ningún jugador con ese nombre" className="w-full" inputClassName="h-11 rounded-2xl px-4" />
      </div>

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        !d ? <LoadingState rows={3} /> :
        d.battles.length === 0 ? (
          <EmptyState className="py-6" title="Todavía no se enfrentaron" description="Cuando jueguen entre ellos, su historial aparecerá aquí." />
        ) : (
          <>
            <div role="group" aria-label="Marcador" className="flex items-center justify-center gap-4">
              <Lado nombre={nombre(d.a)} victorias={d.wins_a} gana={d.wins_a > d.wins_b} />
              <span aria-hidden="true" className="font-card-mono text-[40px] leading-none text-muted-foreground">–</span>
              <Lado nombre={nombre(d.b)} victorias={d.wins_b} gana={d.wins_b > d.wins_a} />
            </div>
            {d.ties > 0 && <p className="-mt-2 text-center text-footnote text-muted-foreground">{d.ties} {d.ties === 1 ? "empate" : "empates"}</p>}

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ul aria-label="Últimas batallas entre ellos" className="divide-y divide-border">
                {d.battles.map((x) => (
                  <li key={x.battle_id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">
                      {x.winner ? <><span className="font-semibold">{nombre(x.winner)}</span> <span className="text-footnote text-muted-foreground">ganó</span></> : <span className="font-semibold">Empate</span>}
                    </span>
                    <span className="shrink-0 text-footnote text-muted-foreground">{x.turns} turnos · {haceCuanto(x.date)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3">
                <Asesino jugador={nombre(d.a)} killer={d.top_killer.a} dexNum={dexNum} />
                <Asesino jugador={nombre(d.b)} killer={d.top_killer.b} dexNum={dexNum} />
              </div>
            </div>
          </>
        )}
    </div>
  );

  // Misma tarjeta (borde con brillo y spotlight en hover) que el bento de la página.
  return <MagicBento columns={1} rowHeight={120} items={[{ id: "h2h", label: "Cara a cara", content: contenido }]} />;
}

function Lado({ nombre, victorias, gana }: { nombre: string; victorias: number; gana: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <span className={cn("font-card-mono text-[56px] font-medium leading-none tabular", !gana && "text-muted-foreground")}>{victorias}</span>
      <Link to={`/j/${encodeURIComponent(nombre)}`} className="mt-2 max-w-full truncate rounded text-subhead font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{nombre}</Link>
    </div>
  );
}

function Asesino({ jugador, killer, dexNum }: { jugador: string; killer: Killer; dexNum?: (species: string) => number | undefined }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/60 p-3 text-center">
      <p className="text-caption text-muted-foreground">Más KOs de {jugador}</p>
      {killer ? (
        <>
          <span className="grid size-16 place-items-center"><PokemonArtwork name={killer.species} dexNum={dexNum?.(killer.species)} className="text-caption" /></span>
          <p className="max-w-full truncate text-subhead font-semibold">{killer.species}</p>
          <p className="font-card-mono text-footnote tabular text-muted-foreground">{killer.kills} KOs</p>
        </>
      ) : <p className="py-4 text-footnote text-muted-foreground">Sin KOs</p>}
    </div>
  );
}
