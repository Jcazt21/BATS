import { Link } from "react-router-dom";
import { PokemonArtwork } from "@/components/app/PokemonArtwork";
import type { RosterPokemon } from "@/lib/api";
import { parseTypes, typeColor, typeLabel, typeTint } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

export interface TeamCardProps {
  pool: RosterPokemon[];
  /** Si ya fijó su alineación, se muestran solo esos; si no, todo el pool. */
  lineupSet?: boolean;
  maxTeamSize?: number;
  season?: string;
  /** Número de Pokédex de una especie (del dex local); `undefined` si no se conoce. */
  dexNum: (species: string) => number | undefined;
  className?: string;
}

/** "Tu equipo": una columna por pokémon con artwork 2D, nombre y chips de tipo. */
export function TeamCard({ pool, lineupSet, maxTeamSize, season, dexNum, className }: TeamCardProps) {
  const shown = lineupSet ? pool.filter((p) => p.in_lineup) : pool;
  return (
    <section
      aria-label="Tu equipo"
      className={cn(
        "flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--team-line)] bg-[var(--team-surface)] font-card text-[var(--team-text)] lg:h-[485px]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-7 py-[22px]">
        <div className="flex min-w-0 items-baseline gap-3.5">
          <h2 className="text-2xl font-bold">Tu equipo</h2>
          <span className="truncate font-card-mono text-footnote text-[var(--team-muted)]">
            {shown.length}{maxTeamSize ? `/${maxTeamSize}` : ""}{season ? ` · ${season}` : ""}
          </span>
        </div>
        <Link
          to="/equipo"
          className="shrink-0 rounded-full border border-[var(--team-line-2)] px-4 py-[7px] text-sm text-[oklch(0.8_0.1_210)] outline-none transition-colors hover:border-white hover:text-white focus-visible:ring-2 focus-visible:ring-[oklch(0.8_0.1_210)]"
        >
          Editar
        </Link>
      </header>

      <ul className="grid flex-1 grid-cols-3 lg:grid-cols-6">
        {shown.map((p) => {
          const types = parseTypes(p.types);
          const first = types[0];
          return (
            <li
              key={p.pokemon_id}
              className="group flex flex-col items-center gap-3 border-t-[3px] px-2.5 pb-6"
              style={{
                borderTopColor: first ? typeColor(first) : "var(--team-line-2)",
                background: first ? `linear-gradient(180deg, ${typeTint(first)}, transparent 55%)` : undefined,
              }}
            >
              <div className="mt-2 flex h-40 w-full items-center justify-center transition-transform duration-200 lg:h-[230px] [@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-y-2">
                <PokemonArtwork name={p.name} dexNum={dexNum(p.name)} />
              </div>
              <p className="text-center text-[17px] font-bold text-white">{p.name}</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {types.map((t) => (
                  <span key={t} className="rounded-full px-2.5 py-[3px] text-caption font-medium text-[var(--team-chip-ink)]" style={{ background: typeColor(t) }}>
                    {typeLabel(t)}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
