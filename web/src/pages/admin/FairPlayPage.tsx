import { useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { DataList, type Column } from "@/components/app/DataList";
import { EmptyState, ErrorState } from "@/components/app/States";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { Badge } from "@/components/ui/badge";
import type { BanViolation, TeamViolation } from "@/lib/api";
import { useAdminSeasons, useBanViolations, useTeamViolations } from "@/lib/queries";
import { fmtDate } from "@/lib/format";

const KIND = {
  not_in_roster: { label: "Fuera del roster", hint: "Usó un pokémon que no registró." },
  no_roster_registered: { label: "Sin roster", hint: "Jugó sin tener equipo registrado." },
  rotation_exceeded: { label: "Rotaciones excedidas", hint: "Cambió su lineup sin rotaciones disponibles." },
} as const;

/** Lo que el ETL detecta en cada batalla: bans usados, pokémon fuera del roster y rotaciones de más. */
export function FairPlayPage() {
  const seasons = useAdminSeasons();
  const active = seasons.data?.find((s) => s.is_active) ?? seasons.data?.[0];
  const [view, setView] = useState<"team" | "ban">("team");
  const id = active?.season_id ?? 0;
  const team = useTeamViolations(id, !!active);
  const ban = useBanViolations(id, !!active);

  const teamCols: Column<TeamViolation>[] = [
    { key: "player", header: "Jugador", primary: true, sortValue: (r) => r.player_username, cell: (r) => <span className="font-medium">{r.player_username}</span> },
    { key: "mon", header: "Pokémon", cell: (r) => <span className="inline-flex items-center gap-2"><PokemonSprite species={r.pokemon_species} size={28} />{r.pokemon_species}</span> },
    { key: "kind", header: "Infracción", cell: (r) => <Badge variant={r.violation_type === "rotation_exceeded" ? "warning" : "destructive"} title={KIND[r.violation_type].hint}>{KIND[r.violation_type].label}</Badge> },
    { key: "active", header: "En campo", hideOnMobile: true, cell: (r) => (r.was_active ? "Sí" : "En banca") },
    { key: "date", header: "Batalla", sortValue: (r) => r.battle_date ?? "", cell: (r) => fmtDate(r.battle_date) },
  ];
  const banCols: Column<BanViolation>[] = [
    { key: "player", header: "Jugador", primary: true, sortValue: (r) => r.player_username, cell: (r) => <span className="font-medium">{r.player_username}</span> },
    { key: "mon", header: "Pokémon baneado", cell: (r) => <span className="inline-flex items-center gap-2"><PokemonSprite species={r.pokemon_species} src={r.sprite_url} size={28} />{r.pokemon_species}</span> },
    { key: "active", header: "En campo", hideOnMobile: true, cell: (r) => (r.was_active ? "Sí" : "En banca") },
    { key: "date", header: "Batalla", sortValue: (r) => r.battle_date ?? "", cell: (r) => fmtDate(r.battle_date) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={active?.season_name} title="Fair play" subtitle="Infracciones detectadas automáticamente al cargar cada batalla." />
      <SegmentedControl label="Tipo" value={view} onChange={setView} options={[
        { value: "team", label: `Equipo ${team.data?.length ?? ""}` }, { value: "ban", label: `Bans ${ban.data?.length ?? ""}` },
      ]} />
      {!active && !seasons.isPending ? <EmptyState title="No hay temporadas" /> :
        view === "team" ? (
          team.isError ? <ErrorState error={team.error} onRetry={() => team.refetch()} /> :
          <DataList caption="Infracciones de equipo" rows={team.data ?? []} columns={teamCols} rowKey={(r) => r.violation_id} loading={team.isPending || seasons.isPending}
            defaultSort={{ key: "date", dir: "desc" }} empty={<EmptyState title="Todo en orden" description="Nadie ha usado pokémon fuera de su roster ni rotado de más." />} />
        ) : (
          ban.isError ? <ErrorState error={ban.error} onRetry={() => ban.refetch()} /> :
          <DataList caption="Bans usados" rows={ban.data ?? []} columns={banCols} rowKey={(r) => r.violation_id} loading={ban.isPending || seasons.isPending}
            defaultSort={{ key: "date", dir: "desc" }} empty={<EmptyState title="Todo en orden" description="Nadie ha llevado un pokémon que tenga baneado." />} />
        )}
    </div>
  );
}
