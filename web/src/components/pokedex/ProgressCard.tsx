import { Meter } from "@/components/app/Meter";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import type { DexProgress } from "@/lib/dex/collection";
import { haceCuanto } from "@/lib/format";

/** Card bajo el anillo: desglose, último descubierto y progreso por generación. */
export function ProgressCard({ progress }: { progress: DexProgress }) {
  const { seen, evolution, last, byGen } = progress;
  return (
    <section aria-label="Progreso de la Pokédex" className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-footnote text-muted-foreground">Vistos en batalla</dt>
          <dd className="text-title3 font-semibold tabular">{seen}</dd>
        </div>
        <div>
          <dt className="text-footnote text-muted-foreground">Por evolución</dt>
          <dd className="text-title3 font-semibold tabular">{evolution}</dd>
        </div>
      </dl>

      <div>
        <h3 className="mb-1 text-footnote text-muted-foreground">Último descubierto</h3>
        {last?.firstSeen ? (
          <div className="flex items-center gap-2">
            <PokemonSprite species={last.firstSeen.species} size={40} />
            <div className="min-w-0">
              <p className="truncate text-subhead font-medium">{last.species.name}</p>
              <p className="truncate text-footnote text-muted-foreground">
                {haceCuanto(last.firstSeen.at)}, contra {last.firstSeen.opponent}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-footnote text-muted-foreground">Todavía nada: juega una batalla de liga.</p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-footnote text-muted-foreground">Por generación</h3>
        <ul className="flex flex-col gap-1.5">
          {byGen.map((g) => (
            <li key={g.gen} className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-2 text-footnote">
              <span className="text-muted-foreground">Gen {g.gen}</span>
              <Meter value={g.discovered} max={g.total} label={`Generación ${g.gen}: ${g.discovered} de ${g.total}`} />
              <span className="text-right tabular">{g.discovered}/{g.total}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
