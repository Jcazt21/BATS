import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Meter } from "@/components/app/Meter";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { TypeBadges } from "@/components/app/TypeBadge";
import { dexNumber, type DexCell } from "@/lib/dex/collection";
import { fmtDate, num, pct } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { usePokemonStatsEntry } from "@/lib/queries";

const STAT_LABELS: [string, string][] = [
  ["hp", "PS"], ["atk", "Ataque"], ["def", "Defensa"], ["spa", "At. Esp."], ["spd", "Def. Esp."], ["spe", "Velocidad"],
];

/** Origen del descubrimiento: visto en batalla (rival y fecha) o por evolución. */
function origin(cell: DexCell): string {
  if (cell.status === "evolution") return `Descubierto al ver a ${cell.via}`;
  const f = cell.firstSeen;
  return f ? `Visto en batalla contra ${f.opponent} · ${fmtDate(f.at)}` : "Visto en batalla";
}

function TournamentSummary({ species }: { species: string }) {
  const q = usePokemonStatsEntry(species);
  if (q.isPending) return <p className="text-footnote text-muted-foreground">Cargando estadísticas…</p>;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <p className="text-footnote text-muted-foreground">
        {notFound ? "Todavía sin estadísticas de torneo." : "No se pudieron cargar las estadísticas."}
      </p>
    );
  }
  const s = q.data;
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      <div><dt className="text-footnote text-muted-foreground">Pick</dt><dd className="font-semibold tabular">{pct(s.pick_pct, 1)}</dd></div>
      <div><dt className="text-footnote text-muted-foreground">Win rate</dt><dd className="font-semibold tabular">{pct(s.win_rate_pct, 1)}</dd></div>
      <div><dt className="text-footnote text-muted-foreground">MVP medio</dt><dd className="font-semibold tabular">{num(s.avg_mvp, 2)}</dd></div>
    </dl>
  );
}

function EntryBody({ cell }: { cell: DexCell }) {
  const sp = cell.species;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <PokemonSprite species={sp.name} size={96} />
        <div className="min-w-0">
          <p className="font-mono text-footnote text-muted-foreground tabular">{dexNumber(cell.num)}</p>
          <TypeBadges types={sp.types.join(" / ")} className="mt-1" />
          <p className="mt-2 text-footnote text-muted-foreground">{origin(cell)}</p>
        </div>
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
        <TournamentSummary species={sp.name} />
        <Link
          to={`/stats/pokemon/${encodeURIComponent(sp.name)}`}
          className="mt-3 inline-block text-subhead text-primary hover:underline"
        >
          Ver estadísticas completas
        </Link>
      </Section>
    </div>
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

/**
 * Ficha de una casilla descubierta, sobre la grilla. Usa ResponsiveSheet: diálogo centrado en
 * pantallas anchas y hoja inferior arrastrable en el celular (ambas animadas y con reduced-motion).
 */
export function DexEntryModal({ cell, onClose }: { cell: DexCell; onClose: () => void }) {
  return (
    <ResponsiveSheet
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={cell.species.name}
      className="sm:max-w-md"
    >
      <EntryBody cell={cell} />
    </ResponsiveSheet>
  );
}
