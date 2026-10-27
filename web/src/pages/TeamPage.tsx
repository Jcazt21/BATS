import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ClipboardCopy, Loader2, Lock, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { Meter } from "@/components/app/Meter";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { Reveal } from "@/components/app/Reveal";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SignInCard } from "@/components/SignInCard";
import { MonActions } from "@/components/team/MonActions";
import { MonCard } from "@/components/team/MonCard";
import { RotationRules } from "@/components/team/RotationRules";
import { RuleErrors } from "@/components/team/RuleErrors";
import { TeamSummary } from "@/components/team/TeamSummary";
import { SetEditor } from "@/components/builder/SetEditor";
import { TeamBuilder } from "@/components/builder/TeamBuilder";
import type { PokemonPayload, RosterPokemon } from "@/lib/api";
import type { DexEssentials } from "@/lib/dex/snapshot";
import { speciesById } from "@/lib/dex/snapshot";
import { useLearnset } from "@/lib/dex/useLearnset";
import { checkSetProblems, type BuilderMon, type RuleSeason } from "@/lib/dex/validate";
import { ApiError } from "@/lib/http";
import { teamErrorMessage } from "@/lib/dex/ruleMessages";
import {
  useActiveSeason, useAddPokemon, useDexEssentials, useEditSet, useMe, usePlayerBans, useRegisterTeam, useRemovePokemon,
  useRoster, useRotationHistory, useSwapPokemon,
} from "@/lib/queries";
import { draftKey } from "@/lib/draft";
import { useSession } from "@/lib/session";
import { toPaste } from "@/lib/showdown";
import { useToast } from "@/lib/toast";
import { fmtDateShort } from "@/lib/format";

function toBuilderMon(p: RosterPokemon): BuilderMon {
  return {
    species: p.name, held_item: p.held_item, ability: p.ability, nature: p.nature, tera_type: p.tera_type,
    moves: p.moves, evs: p.evs, ivs: p.ivs,
  };
}

/** Los metadatos (color/generación/egg groups/tipos) salen del dex local; la API los vuelve a
 *  resolver del lado del servidor (bats_core.dex.resolve_entries) — lo que viaje aquí es orientativo. */
function toPayload(dex: DexEssentials, mon: BuilderMon): PokemonPayload {
  const sp = speciesById(dex, mon.species);
  return {
    name: sp?.name ?? mon.species, national_dex: sp?.num ?? null, types: sp ? sp.types.join(" / ") : null,
    sprite_url: null, held_item: mon.held_item, ability: mon.ability, nature: mon.nature, tera_type: mon.tera_type,
    moves: mon.moves, evs: mon.evs, ivs: mon.ivs, color: sp?.color ?? null, generation: sp?.gen ?? null,
    egg_groups: sp?.eggGroups ?? [],
  };
}

export function TeamPage() {
  const { session, loading } = useSession();
  const season = useActiveSeason();
  const roster = useRoster();
  const dex = useDexEssentials();
  const closed = !!season.data?.restrictions?.registration_closed;

  let body;
  // Nunca en blanco: mientras se resuelve sesión, dex o equipo hay un esqueleto del tamaño de la lista.
  const cargando = loading || (!!session && (dex.isPending || (!dex.isError && roster.isPending)));
  if (cargando) body = <Group loading loadingRows={4} />;
  else if (!session) {
    body = <div className="flex justify-center"><SignInCard title="Tu equipo" description="Inicia sesión con el correo con el que te registró el admin." /></div>;
  } else if (dex.isError) {
    body = <ErrorState error={dex.error} onRetry={() => dex.refetch()} />;
  } else if (roster.isError) {
    const status = roster.error instanceof ApiError ? roster.error.status : 0;
    body =
      status === 404 ? (closed
        ? <EmptyState icon={<Lock strokeWidth={1.25} />} title="El registro está cerrado" description="No registraste un equipo a tiempo. Habla con el administrador." />
        : <Register dex={dex.data!} maxSize={season.data?.max_team_size ?? 8} />)
      : status === 403 ? <EmptyState title="Tu cuenta no está en esta temporada" description="Pídele al administrador que te agregue a la whitelist." />
      : <ErrorState error={roster.error} onRetry={() => roster.refetch()} />;
  } else {
    body = <RosterView closed={closed} dex={dex.data!} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={season.data ? `${season.data.season_name} · hasta ${season.data.max_team_size} pokémon` : undefined}
        title="Mi equipo"
        subtitle="Registra tu pool, comprueba las reglas en vivo y consulta tus rotaciones."
      />
      {cargando ? body : <Reveal>{body}</Reveal>}
    </div>
  );
}

// ── Registro ──────────────────────────────────────────────────────────────────

function Register({ dex, maxSize }: { dex: DexEssentials; maxSize: number }) {
  const season = useActiveSeason();
  const bans = usePlayerBans();
  const register = useRegisterTeam();
  const me = useMe();
  const { toast } = useToast();
  const [dirty, setDirty] = useState(false);
  const banned = useMemo(() => new Set((bans.data ?? []).map((b) => b.name.toLowerCase())), [bans.data]);
  const ruleSeason: RuleSeason = {
    type_of_month: season.data?.type_of_month, max_team_size: maxSize, restrictions: season.data?.restrictions ?? {},
  };
  // Sin temporada o sin usuario no hay clave estable: se trabaja sin borrador.
  const key = season.data && me.data ? draftKey(season.data.season_id, me.data.username) : undefined;
  // El borrador se restaura al montar TeamBuilder: hay que esperar a tener la clave (si me falla, sin borrador).
  const waitingKey = me.isPending || season.isPending;

  // Avisa del navegador al cerrar o recargar la pestaña con cambios sin registrar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      {waitingKey ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : (
        <TeamBuilder
          key={key ?? "sin-borrador"}
          dex={dex} initial={[]} season={ruleSeason} banned={banned} maxSize={maxSize}
          draftKey={key} onDirtyChange={setDirty}
          saveLabel="Registrar equipo"
          onSave={async (team) => {
            await register.mutateAsync(team.map((m) => toPayload(dex, m)));
            toast({ title: "Equipo registrado", tone: "success" });
          }}
        />
      )}
    </div>
  );
}

// ── Equipo registrado ─────────────────────────────────────────────────────────

function RosterView({ closed, dex }: { closed: boolean; dex: DexEssentials }) {
  const roster = useRoster();
  const season = useActiveSeason();
  const bans = usePlayerBans();
  const history = useRotationHistory();
  const remove = useRemovePokemon();
  const swap = useSwapPokemon();
  const add = useAddPokemon();
  const { toast } = useToast();
  const [removing, setRemoving] = useState<RosterPokemon | null>(null);
  const [swapping, setSwapping] = useState<RosterPokemon | null>(null);
  const [editing, setEditing] = useState<RosterPokemon | null>(null);
  const [adding, setAdding] = useState(false);
  const [addDirty, setAddDirty] = useState(false);
  const [swapDirty, setSwapDirty] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  // Cierre pendiente de confirmar porque el sheet tiene cambios sin guardar.
  const [discard, setDiscard] = useState<(() => void) | null>(null);

  const closeAdd = () => { setAdding(false); setAddDirty(false); };
  const closeSwap = () => { setSwapping(null); setSwapDirty(false); };
  const closeEdit = () => { setEditing(null); setEditDirty(false); };
  /** Cierra ya si no hay cambios; si los hay, pide confirmación primero. */
  const guardClose = (dirty: boolean, close: () => void) => { if (dirty) setDiscard(() => close); else close(); };

  const r = roster.data!;
  const banned = useMemo(() => new Set((bans.data ?? []).map((b) => b.name.toLowerCase())), [bans.data]);
  const room = r.max_team_size - r.pool.length;
  const ruleSeason: RuleSeason = {
    type_of_month: season.data?.type_of_month, max_team_size: r.max_team_size, restrictions: season.data?.restrictions ?? {},
  };
  const contextWithout = (id?: number): BuilderMon[] => r.pool.filter((p) => p.pokemon_id !== id).map(toBuilderMon);

  async function copy(mons: RosterPokemon[] = r.pool) {
    const paste = mons.map((p) => toPaste(p)).join("\n\n");
    const que = mons.length === 1 ? mons[0].name : "Tu equipo";
    try { await navigator.clipboard.writeText(paste); toast({ title: "Copiado", description: `${que} está en el portapapeles en formato Showdown.`, tone: "success" }); }
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
          <Button variant="secondary" size="sm" onClick={() => void copy()}><ClipboardCopy /> Copiar equipo</Button>
          {!closed && room > 0 && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Agregar</Button>}
        </div>
      </div>

      <TeamSummary mons={r.pool} validation={r.validation} />

      {r.validation.state === "errors" && (
        <RuleErrors title="Showdown encontró problemas en tu equipo registrado:" errors={r.validation.errors}
          target={(e) => {
            if (closed) return undefined;
            const p = r.pool.find((m) => e.toLowerCase().includes(m.name.toLowerCase()));
            return p ? () => setEditing(p) : undefined;
          }} />
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Pokémon de tu equipo">
        <AnimatePresence initial={false}>
        {r.pool.map((p) => (
          <MonCard key={p.pokemon_id} mon={p} banned={banned.has(p.name.toLowerCase())}
            badge={p.in_lineup ? <Badge variant="info">En el lineup</Badge> : undefined}
            actions={!closed && (
              <MonActions name={p.name} onEdit={() => setEditing(p)} onCopy={() => void copy([p])}
                onSwap={() => setSwapping(p)} onRemove={() => setRemoving(p)} />
            )} />
        ))}
        </AnimatePresence>
      </ul>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
          <h2 className="text-headline">Rotaciones</h2>
          <RotationRules maxRotations={r.max_rotations} />
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
              catch (err) { toast({ title: "No se pudo quitar", description: teamErrorMessage(err), tone: "error" }); }
            }}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editar set */}
      <ResponsiveSheet
        open={!!editing} onOpenChange={(o) => !o && guardClose(editDirty, closeEdit)}
        title={`Editar el set de ${editing?.name ?? ""}`}
        description="Objeto, habilidad, naturaleza, tera, movimientos, EVs e IVs. No consume cambios."
      >
        {editing && <EditSetForm dex={dex} pokemon={editing} onDone={closeEdit} onDirtyChange={setEditDirty} />}
      </ResponsiveSheet>

      {/* Agregar */}
      <ResponsiveSheet open={adding} onOpenChange={(o) => (o ? setAdding(true) : guardClose(addDirty, closeAdd))} title="Agregar pokémon" description={`Te caben ${room} más.`}>
        <TeamBuilder
          dex={dex} initial={[]} context={contextWithout()} season={ruleSeason} banned={banned} maxSize={room}
          saveLabel="Agregar al equipo" inline onDirtyChange={setAddDirty}
          onSave={async (team) => {
            await add.mutateAsync(team.map((m) => toPayload(dex, m)));
            closeAdd();
            toast({ title: "Pokémon agregados", tone: "success" });
          }}
        />
      </ResponsiveSheet>

      {/* Reemplazar */}
      <ResponsiveSheet
        open={!!swapping} onOpenChange={(o) => !o && guardClose(swapDirty, closeSwap)}
        title={`Reemplazar a ${swapping?.name ?? ""}`}
        description="Elige el pokémon nuevo. El cambio es atómico: si algo falla, no se quita nada."
      >
        {swapping && (
          <TeamBuilder
            dex={dex} initial={[]} context={contextWithout(swapping.pokemon_id)} season={ruleSeason} banned={banned} maxSize={1}
            saveLabel="Reemplazar" inline onDirtyChange={setSwapDirty}
            onSave={async (team) => {
              await swap.mutateAsync({ removeId: swapping.pokemon_id, add: toPayload(dex, team[0]) });
              closeSwap();
              toast({ title: "Pokémon reemplazado", tone: "success" });
            }}
          />
        )}
      </ResponsiveSheet>

      {/* Cerrar un sheet con cambios sin guardar */}
      <AlertDialog open={!!discard} onOpenChange={(o) => !o && setDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>Lo que armaste y no guardaste se perderá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { discard?.(); setDiscard(null); }}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditSetForm({ dex, pokemon, onDone, onDirtyChange }: {
  dex: DexEssentials; pokemon: RosterPokemon; onDone: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [mon, setMon] = useState<BuilderMon>(() => toBuilderMon(pokemon));
  const editSet = useEditSet();
  const { toast } = useToast();
  const dirty = JSON.stringify(mon) !== JSON.stringify(toBuilderMon(pokemon));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const species = speciesById(dex, mon.species);
  const { learnset, error: learnsetError } = useLearnset(species?.id ?? null);
  const problems = checkSetProblems(dex, learnset, mon);
  // Sin learnset (cargando o fallido) no se puede garantizar que los movimientos sean legales.
  const learnsetReady = learnset !== null && !learnsetError;

  async function save() {
    try {
      await editSet.mutateAsync({ pokemonId: pokemon.pokemon_id, payload: toPayload(dex, mon) });
      toast({ title: "Set actualizado", tone: "success" });
      onDone();
    } catch (e) {
      toast({ title: "No se pudo guardar", description: teamErrorMessage(e), tone: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SetEditor mon={mon} dex={dex} onChange={setMon} problems={problems} />
      <Button size="lg" disabled={!learnsetReady || problems.length > 0 || editSet.isPending} onClick={() => void save()}>
        {editSet.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : "Guardar cambios"}
      </Button>
    </div>
  );
}
