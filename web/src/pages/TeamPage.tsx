import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ClipboardCopy, Lock, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { Meter } from "@/components/app/Meter";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SignInCard } from "@/components/SignInCard";
import { MonCard } from "@/components/team/MonCard";
import { PasteBuilder } from "@/components/team/PasteBuilder";
import type { PokemonPayload, RosterPokemon } from "@/lib/api";
import { ApiError, errorMessage } from "@/lib/http";
import {
  useActiveSeason, usePlayerBans, useRegisterTeam, useRemovePokemon, useRoster, useRotationHistory,
  useSwapPokemon, useAddPokemon,
} from "@/lib/queries";
import { useSession } from "@/lib/session";
import { toPaste } from "@/lib/showdown";
import { lookupSpecies, toPayload } from "@/lib/team-resolve";
import { useToast } from "@/lib/toast";
import { fmtDateShort } from "@/lib/format";

export function TeamPage() {
  const { session, loading } = useSession();
  const season = useActiveSeason();
  const roster = useRoster();
  const closed = !!season.data?.restrictions?.registration_closed;

  let body;
  if (loading) body = null;
  else if (!session) {
    body = <div className="flex justify-center"><SignInCard title="Tu equipo" description="Inicia sesión con el correo con el que te registró el admin." /></div>;
  } else if (roster.isPending) {
    body = <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>;
  } else if (roster.isError) {
    const status = roster.error instanceof ApiError ? roster.error.status : 0;
    body =
      status === 404 ? (closed
        ? <EmptyState icon={<Lock strokeWidth={1.25} />} title="El registro está cerrado" description="No registraste un equipo a tiempo. Habla con el administrador." />
        : <Register maxSize={season.data?.max_team_size ?? 8} />)
      : status === 403 ? <EmptyState title="Tu cuenta no está en esta temporada" description="Pídele al administrador que te agregue a la whitelist." />
      : <ErrorState error={roster.error} onRetry={() => roster.refetch()} />;
  } else {
    body = <RosterView closed={closed} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={season.data ? `${season.data.season_name} · hasta ${season.data.max_team_size} pokémon` : undefined}
        title="Mi equipo"
        subtitle="Registra tu pool, comprueba las reglas en vivo y consulta tus rotaciones."
      />
      {body}
    </div>
  );
}

// ── Registro ──────────────────────────────────────────────────────────────────

function Register({ maxSize }: { maxSize: number }) {
  const register = useRegisterTeam();
  const { toast } = useToast();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PasteBuilder
        context={[]} maxNew={maxSize} submitLabel="Registrar equipo"
        onSubmit={async (mons) => {
          await register.mutateAsync(mons);
          toast({ title: "Equipo registrado", tone: "success" });
        }}
      />
    </div>
  );
}

// ── Equipo registrado ─────────────────────────────────────────────────────────

/** Los pokémon ya guardados no traen color/generación/egg group: se recuperan de PokéAPI para comprobar reglas. */
function usePoolPayloads(pool: RosterPokemon[]) {
  return useQuery({
    queryKey: ["team", "pool-payloads", pool.map((p) => p.name).sort().join("|")],
    queryFn: async (): Promise<Map<number, PokemonPayload>> => {
      const entries = await Promise.all(pool.map(async (p) => {
        const info = await lookupSpecies(p.name).catch(() => null);
        const payload: PokemonPayload = info
          ? toPayload(p, info, p.name)
          : { name: p.name, national_dex: null, types: p.types, sprite_url: p.sprite_url, held_item: p.held_item };
        return [p.pokemon_id, { ...payload, sprite_url: p.sprite_url ?? payload.sprite_url }] as const;
      }));
      return new Map(entries);
    },
    staleTime: Infinity,
  });
}

function RosterView({ closed }: { closed: boolean }) {
  const roster = useRoster();
  const bans = usePlayerBans();
  const history = useRotationHistory();
  const poolPayloads = usePoolPayloads(roster.data?.pool ?? []);
  const remove = useRemovePokemon();
  const swap = useSwapPokemon();
  const add = useAddPokemon();
  const { toast } = useToast();
  const [removing, setRemoving] = useState<RosterPokemon | null>(null);
  const [swapping, setSwapping] = useState<RosterPokemon | null>(null);
  const [adding, setAdding] = useState(false);

  const r = roster.data!;
  const banned = useMemo(() => new Set((bans.data ?? []).map((b) => b.name.toLowerCase())), [bans.data]);
  const room = r.max_team_size - r.pool.length;
  const contextWithout = (id?: number): PokemonPayload[] =>
    r.pool.filter((p) => p.pokemon_id !== id).map((p) => poolPayloads.data?.get(p.pokemon_id)).filter((p): p is PokemonPayload => !!p);

  async function copy() {
    const paste = r.pool.map((p) => toPaste(p)).join("\n\n");
    try { await navigator.clipboard.writeText(paste); toast({ title: "Copiado", description: "Tu equipo está en el portapapeles en formato Showdown.", tone: "success" }); }
    catch { toast({ title: "No se pudo copiar", tone: "error" }); }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {closed && <Badge variant="warning"><Lock /> Registro cerrado</Badge>}
          <Badge variant="secondary">{r.pool.length}/{r.max_team_size} pokémon</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copy()}><ClipboardCopy /> Copiar paste</Button>
          {!closed && room > 0 && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Agregar</Button>}
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Pokémon de tu equipo">
        {r.pool.map((p) => (
          <MonCard key={p.pokemon_id} mon={p} banned={banned.has(p.name.toLowerCase())}
            badge={p.in_lineup ? <Badge variant="info">En el lineup</Badge> : undefined}
            actions={!closed && (
              <>
                <Button variant="secondary" size="xs" onClick={() => setSwapping(p)}><ArrowLeftRight /> Reemplazar</Button>
                <Button variant="ghost" size="xs" onClick={() => setRemoving(p)}><Trash2 /> Quitar</Button>
              </>
            )} />
        ))}
      </ul>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
          <h2 className="text-headline">Rotaciones</h2>
          <p className="text-footnote text-muted-foreground">
            Cambiar los 6 pokémon que llevas a batalla cuenta como una rotación. Se detectan solas al cargar tus batallas.
          </p>
          <Meter label="Rotaciones usadas" value={r.rotations_used} max={Math.max(1, r.max_rotations)} tone={r.rotations_remaining === 0 ? "destructive" : "primary"} />
          <p className="tabular text-subhead"><strong>{r.rotations_remaining}</strong> de {r.max_rotations} disponibles</p>
        </section>

        <Group title="Historial de rotaciones">
          {history.isPending ? <div className="p-4"><Skeleton className="h-16" /></div> :
            !history.data?.rotations.length ? <EmptyState title="Aún no has rotado" description="Tu lineup inicial se fija con tu primera batalla." /> :
            history.data.rotations.map((rot) => (
              <GroupRow key={rot.change_number}
                title={`Rotación ${rot.change_number}`}
                subtitle={<>{rot.removed.length > 0 && <>sale {rot.removed.join(", ")}</>}{rot.removed.length > 0 && rot.added.length > 0 && " · "}{rot.added.length > 0 && <>entra {rot.added.join(", ")}</>}</>}
                trailing={<span className="text-caption text-muted-foreground">{fmtDateShort(rot.changed_at)}</span>} />
            ))}
        </Group>
      </div>

      {/* Quitar */}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar a {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Saldrá de tu pool. Podrás agregarlo de nuevo mientras el registro siga abierto.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={async (e) => {
              e.preventDefault();
              try { await remove.mutateAsync(removing!.pokemon_id); setRemoving(null); }
              catch (err) { toast({ title: "No se pudo quitar", description: errorMessage(err), tone: "error" }); }
            }}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Agregar */}
      <ResponsiveSheet open={adding} onOpenChange={setAdding} title="Agregar pokémon" description={`Te caben ${room} más.`}>
        <PasteBuilder context={contextWithout()} maxNew={room} submitLabel="Agregar al equipo"
          onSubmit={async (mons) => { await add.mutateAsync(mons); setAdding(false); toast({ title: "Pokémon agregados", tone: "success" }); }} />
      </ResponsiveSheet>

      {/* Reemplazar */}
      <ResponsiveSheet open={!!swapping} onOpenChange={(o) => !o && setSwapping(null)} title={`Reemplazar a ${swapping?.name ?? ""}`} description="Pega el pokémon nuevo. El cambio es atómico: si algo falla, no se quita nada.">
        {swapping && (
          <PasteBuilder context={contextWithout(swapping.pokemon_id)} maxNew={1} submitLabel="Reemplazar"
            onSubmit={async (mons) => {
              await swap.mutateAsync({ removeId: swapping.pokemon_id, add: mons[0] });
              setSwapping(null);
              toast({ title: "Pokémon reemplazado", tone: "success" });
            }} />
        )}
      </ResponsiveSheet>
    </div>
  );
}
