import { DataList, type Column } from "@/components/app/DataList";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import type { AdminRosterRow } from "@/lib/api";
import { fmtDateShort } from "@/lib/format";
import { useAdminRosters } from "@/lib/queries";

function ValidationCell({ row }: { row: AdminRosterRow }) {
  if (row.validation.state === "ok") return <Badge variant="success">Validado</Badge>;
  if (row.validation.state === "errors") {
    return <Badge variant="destructive" title={row.validation.errors.join("\n")}>{row.validation.errors.length} errores</Badge>;
  }
  return <Badge variant="secondary">Pendiente</Badge>;
}

const COLUMNS: Column<AdminRosterRow>[] = [
  { key: "username", header: "Jugador", primary: true, sortValue: (r) => r.username, cell: (r) => r.username },
  { key: "pokemon_count", header: "Pokémon", align: "right", sortValue: (r) => r.pokemon_count, cell: (r) => r.pokemon_count },
  { key: "changes_used", header: "Cambios usados", align: "right", sortValue: (r) => r.changes_used, cell: (r) => r.changes_used },
  { key: "has_lineup", header: "Lineup", cell: (r) => (r.has_lineup ? <Badge variant="info">Fijado</Badge> : <span className="text-muted-foreground">—</span>) },
  { key: "is_locked", header: "Bloqueado", cell: (r) => (r.is_locked ? <Badge variant="warning">Sí</Badge> : <span className="text-muted-foreground">No</span>) },
  { key: "validation", header: "Showdown", cell: (r) => <ValidationCell row={r} /> },
  {
    key: "registered_at", header: "Registrado", hideOnMobile: true,
    sortValue: (r) => r.registered_at ?? "", cell: (r) => (r.registered_at ? fmtDateShort(r.registered_at) : "—"),
  },
];

/**
 * Vista de admin de los equipos registrados en la temporada activa: cuántos pokémon
 * tiene cada uno, si ya fijó lineup, cuántos cambios lleva usados y el veredicto del
 * TeamValidator real de Showdown (Task 6/9) — la comprobación de si el equipo se puede
 * jugar de verdad, no solo si pasó las reglas de la liga.
 */
export function RostersPage() {
  const rosters = useAdminRosters();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Equipos registrados"
        subtitle="El estado de Showdown viene de bats-ingest: se actualiza cada vez que sincroniza los rosters."
      />
      {rosters.isError ? (
        <ErrorState error={rosters.error} onRetry={() => rosters.refetch()} />
      ) : (
        <DataList
          rows={rosters.data ?? []}
          columns={COLUMNS}
          rowKey={(r) => r.username}
          loading={rosters.isPending}
          defaultSort={{ key: "username", dir: "asc" }}
          caption="Equipos registrados"
          empty={<EmptyState title="Nadie se ha registrado todavía" />}
        />
      )}
    </div>
  );
}
