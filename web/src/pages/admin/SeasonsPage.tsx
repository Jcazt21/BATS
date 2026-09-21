import { useState } from "react";
import { CalendarPlus, Loader2, MoreHorizontal, Pencil, Power, RefreshCw, Trash2, UsersRound, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { TypeBadges } from "@/components/app/TypeBadge";
import { EmptyState, ErrorState } from "@/components/app/States";
import { SeasonForm, type SeasonFormValues } from "@/components/admin/SeasonForm";
import { SeasonPeople } from "@/components/admin/SeasonPeople";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { activateSeason, closeSeason, createSeason, deleteSeason, runMaintenance, updateSeason, type SeasonEntry } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminMutation, useAdminSeasons } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/lib/toast";

type Dialog = { kind: "create" } | { kind: "edit" | "people" | "delete" | "close"; season: SeasonEntry } | null;

export function SeasonsPage() {
  const q = useAdminSeasons();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useAdminMutation(createSeason, { stats: true });
  const update = useAdminMutation((v: { id: number; payload: Parameters<typeof updateSeason>[1] }) => updateSeason(v.id, v.payload), { stats: true });
  const activate = useAdminMutation(activateSeason, { stats: true });
  const close = useAdminMutation(closeSeason, { stats: true });
  const del = useAdminMutation(deleteSeason, { stats: true });
  const maintenance = useAdminMutation(runMaintenance, { stats: true });

  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    try { await fn(); toast({ title: label, tone: "success" }); after?.(); }
    catch (e) { toast({ title: "No se pudo completar", description: errorMessage(e), tone: "error" }); }
  };

  async function submitForm(v: SeasonFormValues) {
    setFormError(null);
    try {
      const base = { season_name: v.season_name.trim(), type_of_month: v.type_of_month, start_date: v.start_date, max_team_size: v.max_team_size, max_team_changes: v.max_team_changes, restrictions: v.restrictions };
      if (dialog?.kind === "edit") {
        await update.mutateAsync({ id: dialog.season.season_id, payload: { ...base, ...(v.end_date ? { end_date: v.end_date } : { clear_end_date: true }) } });
        toast({ title: "Temporada actualizada", tone: "success" });
      } else {
        await create.mutateAsync({ ...base });
        toast({ title: "Temporada creada", tone: "success" });
      }
      setDialog(null);
    } catch (e) { setFormError(errorMessage(e)); }
  }

  const seasons = q.data ?? [];
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Temporadas"
        subtitle="Solo una temporada está activa a la vez: la que reciben las estadísticas, los bans y el registro de equipos."
        actions={
          <>
            <Button variant="secondary" disabled={maintenance.isPending} onClick={() => run("Estadísticas recalculadas", () => maintenance.mutateAsync())}>
              {maintenance.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Recalcular
            </Button>
            <Button onClick={() => { setFormError(null); setDialog({ kind: "create" }); }}><CalendarPlus /> Nueva</Button>
          </>
        }
      />

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <Group>
          {q.isPending ? <div className="p-4 text-subhead text-muted-foreground" aria-busy>Cargando…</div> :
            !seasons.length ? <EmptyState title="Aún no hay temporadas" action={<Button onClick={() => setDialog({ kind: "create" })}>Crear la primera</Button>} /> :
            seasons.map((s) => (
              <GroupRow key={s.season_id}
                title={<span className="flex flex-wrap items-center gap-2">{s.season_name}{s.is_active && <Badge variant="success">Activa</Badge>}</span>}
                subtitle={`${fmtDate(s.start_date)} → ${s.end_date ? fmtDate(s.end_date) : "sin fin"} · ${s.total_votes} votos`}
                trailing={
                  <span className="flex items-center gap-2">
                    <TypeBadges types={s.type_of_month} />
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${s.season_name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-52">
                        <DropdownMenuItem onClick={() => { setFormError(null); setDialog({ kind: "edit", season: s }); }}><Pencil /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDialog({ kind: "people", season: s })}><UsersRound /> Whitelist y votos</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!s.is_active && <DropdownMenuItem onClick={() => run("Temporada activada", () => activate.mutateAsync(s.season_id))}><Power /> Activar</DropdownMenuItem>}
                        {s.is_active && <DropdownMenuItem onClick={() => setDialog({ kind: "close", season: s })}><XCircle /> Cerrar temporada</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => setDialog({ kind: "delete", season: s })}><Trash2 /> Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                } />
            ))}
        </Group>
      )}

      <ResponsiveSheet open={dialog?.kind === "create" || dialog?.kind === "edit"} onOpenChange={(o) => !o && setDialog(null)} className="sm:max-w-xl"
        title={dialog?.kind === "edit" ? "Editar temporada" : "Nueva temporada"}>
        {(dialog?.kind === "create" || dialog?.kind === "edit") && (
          <SeasonForm key={dialog.kind === "edit" ? dialog.season.season_id : "new"} season={dialog.kind === "edit" ? dialog.season : undefined}
            busy={create.isPending || update.isPending} error={formError} onSubmit={(v) => void submitForm(v)} />
        )}
      </ResponsiveSheet>

      <ResponsiveSheet open={dialog?.kind === "people"} onOpenChange={(o) => !o && setDialog(null)} className="sm:max-w-xl"
        title={dialog?.kind === "people" ? dialog.season.season_name : ""} description="Quién puede votar y cómo va la votación.">
        {dialog?.kind === "people" && <SeasonPeople seasonId={dialog.season.season_id} />}
      </ResponsiveSheet>

      <AlertDialog open={dialog?.kind === "delete" || dialog?.kind === "close"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "delete" ? "¿Eliminar la temporada?" : "¿Cerrar la temporada?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "delete"
                ? "Solo se puede eliminar si no tiene votos ni bans. No se puede deshacer."
                : "Se marcará como no activa con fecha de fin hoy. Sin temporada activa, el registro y la votación se pausan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant={dialog?.kind === "delete" ? "destructive" : "default"} onClick={(e) => {
              e.preventDefault();
              if (dialog?.kind !== "delete" && dialog?.kind !== "close") return;
              const id = dialog.season.season_id;
              void run(dialog.kind === "delete" ? "Temporada eliminada" : "Temporada cerrada", () => (dialog.kind === "delete" ? del : close).mutateAsync(id), () => setDialog(null));
            }}>{dialog?.kind === "delete" ? "Eliminar" : "Cerrar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
