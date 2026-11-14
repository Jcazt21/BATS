import { useCallback, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Meter } from "@/components/app/Meter";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { TypeBadges } from "@/components/app/TypeBadge";
import { PokemonHolo } from "@/components/home/PokemonHolo";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { PokedexEntry } from "@/lib/api";
import { dexNumber, type DexCell } from "@/lib/dex/collection";
import { leagueSetCard } from "@/lib/dex/league-set";
import { speciesById, toId, type Species } from "@/lib/dex/snapshot";
import { fmtDate, num, pct } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useDexDetails, useDexEssentials, usePokemonStatsEntry } from "@/lib/queries";

const STAT_LABELS: [string, string][] = [
  ["hp", "PS"], ["atk", "Ataque"], ["def", "Defensa"], ["spa", "At. Esp."], ["spd", "Def. Esp."], ["spe", "Velocidad"],
];

/** Origen del descubrimiento: visto en batalla (rival y fecha) o por evolución. */
function origin(cell: DexCell): string {
  if (cell.status === "evolution") return `Descubierto al ver a ${cell.via}`;
  const f = cell.firstSeen;
  return f ? `Visto en batalla contra ${f.opponent} · ${fmtDate(f.at)}` : "Visto en batalla";
}

type StatsQuery = ReturnType<typeof usePokemonStatsEntry>;

/**
 * La carta holográfica de la Home, con el set más usado en la liga. El pie explica de dónde sale el
 * set, o que todavía no hay ninguno público.
 */
function EntryCard({ cell, species, stats, width }: { cell: DexCell; species: Species; stats: StatsQuery; width: number }) {
  const details = useDexDetails();
  const entry: PokedexEntry | undefined = stats.data;
  const card = useMemo(() => leagueSetCard(species, entry), [species, entry]);
  const moveType = useCallback((move: string) => details.data?.moves[toId(move)]?.type, [details.data]);
  const players = entry?.sets.players ?? 0;
  return (
    <figure className="flex flex-col items-center gap-3" style={{ width }}>
      <div style={{ width }}>
        <PokemonHolo pokemon={card} dexNum={cell.num} sprite={species.spriteid} moveType={moveType} width={width} />
      </div>
      <figcaption className="text-center text-caption text-muted-foreground">
        {players > 0
          ? `Set más usado en la liga · ${players} ${players === 1 ? "jugador" : "jugadores"}`
          : "Todavía sin sets públicos en la liga"}
      </figcaption>
    </figure>
  );
}

function TournamentSummary({ stats }: { stats: StatsQuery }) {
  if (stats.isPending) return <p className="text-footnote text-muted-foreground">Cargando estadísticas…</p>;
  if (stats.isError) {
    const notFound = stats.error instanceof ApiError && stats.error.status === 404;
    return (
      <p className="text-footnote text-muted-foreground">
        {notFound ? "Todavía sin estadísticas de torneo." : "No se pudieron cargar las estadísticas."}
      </p>
    );
  }
  const s = stats.data;
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-background/60 p-3 text-center ring-1 ring-border">
      <div><dt className="text-caption text-muted-foreground">Pick</dt><dd className="font-card-mono text-title3 tabular">{pct(s.pick_pct, 1)}</dd></div>
      <div><dt className="text-caption text-muted-foreground">Win rate</dt><dd className="font-card-mono text-title3 tabular">{pct(s.win_rate_pct, 1)}</dd></div>
      <div><dt className="text-caption text-muted-foreground">MVP medio</dt><dd className="font-card-mono text-title3 tabular">{num(s.avg_mvp, 2)}</dd></div>
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-footnote font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function EntryBody({ cell, wide }: { cell: DexCell; wide: boolean }) {
  const dex = useDexEssentials();
  // En la liga se juega la forma (Charizard-Mega-Y, Scizor-Mega): la carta, las stats base y el torneo
  // son de la forma vista primero; sin avistamiento propio (por evolución), de la especie base.
  const sp = (cell.firstSeen && dex.data && speciesById(dex.data, cell.firstSeen.species)) || cell.species;
  const stats = usePokemonStatsEntry(sp.name);
  return (
    <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
      <div className="flex justify-center">
        <EntryCard cell={cell} species={sp} stats={stats} width={wide ? 240 : 220} />
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-card-mono text-subhead text-muted-foreground tabular">{dexNumber(cell.num)}</span>
            <TypeBadges types={sp.types.join(" / ")} />
          </div>
          <p className="mt-2 text-footnote text-muted-foreground">{origin(cell)}</p>
        </div>

        {cell.seenForms.length > 0 && (
          <Section title="Formas vistas">
            <p className="text-subhead">{cell.seenForms.join(", ")}</p>
          </Section>
        )}

        <Section title="Stats base">
          <ul className="flex flex-col gap-1.5">
            {STAT_LABELS.map(([key, label]) => (
              <li key={key} className="grid grid-cols-[5rem_2.5rem_1fr] items-center gap-2 text-footnote">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right tabular">{sp.baseStats[key] ?? "—"}</span>
                <Meter value={sp.baseStats[key] ?? 0} max={255} label={`${label}: ${sp.baseStats[key] ?? 0}`} />
              </li>
            ))}
          </ul>
        </Section>

        {sp.abilities.length > 0 && (
          <Section title="Habilidades">
            <p className="text-subhead">{sp.abilities.join(", ")}</p>
          </Section>
        )}

        <Section title="En el torneo">
          <TournamentSummary stats={stats} />
          <Link
            to={`/stats/pokemon/${encodeURIComponent(sp.name)}`}
            className="mt-3 inline-block text-subhead text-primary hover:underline"
          >
            Ver estadísticas completas
          </Link>
        </Section>
      </div>
    </div>
  );
}

/**
 * Ficha de una casilla descubierta, sobre la grilla: la carta holográfica (como en la Home, con el set
 * más usado de la liga) y al lado la info. ResponsiveSheet: diálogo en pantallas anchas, hoja inferior
 * arrastrable en el celular (ambas animadas y con reduced-motion).
 */
export function DexEntryModal({ cell, onClose }: { cell: DexCell; onClose: () => void }) {
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <ResponsiveSheet
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={cell.species.name}
      className="sm:max-w-3xl"
    >
      <EntryBody cell={cell} wide={wide} />
    </ResponsiveSheet>
  );
}
