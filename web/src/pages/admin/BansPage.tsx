import { PageHeader } from "@/components/app/PageHeader";
import { StatTile } from "@/components/app/StatTile";
import { Group, GroupRow } from "@/components/app/Group";
import { Meter } from "@/components/app/Meter";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { useAdminBans } from "@/lib/queries";

/** Resultado de la votación de bans de la temporada activa. */
export function BansPage() {
  const q = useAdminBans();
  const d = q.data;
  const progress = d?.progress;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow={d?.season ? <span className="inline-flex items-center gap-2">{d.season.season_name} {d.season.is_active && <Badge variant="success">Activa</Badge>}</span> : undefined}
        title="Bans"
        subtitle={d?.season ? "Cada jugador banea un pokémon de forma anónima." : "Activa una temporada desde Temporadas."}
      />

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <StatTile label="Han votado" value={progress ? `${progress.voted}/${progress.total}` : "—"} loading={q.isPending}
              hint={progress && <Meter label="Participación" value={progress.voted} max={Math.max(1, progress.total)} className="mt-1" />} />
            <StatTile label="Pokémon baneados" value={d?.bans.length ?? 0} loading={q.isPending} />
          </section>

          <Group title="Pokémon baneados">
            {q.isPending ? <div className="p-4 text-subhead text-muted-foreground" aria-busy>Cargando…</div> :
              !d?.bans.length ? <EmptyState title="Sin bans registrados" description="Aparecerán cuando los jugadores voten." /> :
              d.bans.map((b) => (
                <GroupRow key={b.pokemon_name} leading={<PokemonSprite species={b.pokemon_name} src={b.sprite_url} size={44} />}
                  title={b.pokemon_name} subtitle={b.national_dex ? `Nº ${String(b.national_dex).padStart(4, "0")}` : undefined}
                  trailing={<TypeBadges types={b.pokemon_types} />} />
              ))}
          </Group>
        </>
      )}
    </div>
  );
}
