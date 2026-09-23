import { TypeBadge } from "@/components/app/TypeBadge";
import type { CoverageRow } from "@/lib/dex/coverage";

/** Muestra los tipos que dañan a dos o más integrantes del equipo. */
export function TypeCoveragePanel({ rows, empty }: { rows: CoverageRow[]; empty?: boolean }) {
  const shared = rows.filter((row) => row.sharedWeakness).sort((a, b) => b.weak.length - a.weak.length);

  return (
    <section aria-label="Cobertura de tipos" className="flex flex-col gap-2">
      <h3 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">
        Debilidades compartidas
      </h3>
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {empty ? (
          <p className="px-4 py-3 text-subhead text-muted-foreground">Agrega pokémon para ver su cobertura.</p>
        ) : shared.length === 0 ? (
          <p className="px-4 py-3 text-subhead text-muted-foreground">
            Sin debilidades compartidas: ningún tipo golpea con fuerza a 2 o más de tus pokémon a la vez.
          </p>
        ) : (
          <ul aria-live="polite" className="[&>li+li]:border-t [&>li+li]:border-separator">
            {shared.map((row) => (
              <li key={row.type} className="flex items-start gap-3 px-4 py-3">
                <TypeBadge type={row.type} />
                <span className="min-w-0 flex-1 text-footnote text-destructive">Débil: {row.weak.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
