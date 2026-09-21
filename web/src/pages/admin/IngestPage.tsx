import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { DataList, type Column } from "@/components/app/DataList";
import { EmptyState, ErrorState } from "@/components/app/States";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteEtlFiles, runMaintenance, type EtlFileEntry } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminMutation, useIngestLog } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/lib/toast";

const STATUS = { ok: { label: "Cargada", variant: "success" }, skipped: { label: "Omitida", variant: "warning" }, error: { label: "Error", variant: "destructive" } } as const;

/** Registro de las batallas que ha recibido la API (por push desde Showdown o por backfill). */
export function IngestPage() {
  const log = useIngestLog();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "ok" | "skipped" | "error">("all");
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<EtlFileEntry | null>(null);

  const maintenance = useAdminMutation(runMaintenance, { stats: true });
  const del = useAdminMutation((paths: string[]) => deleteEtlFiles(paths), { stats: true });

  const rows = useMemo(() => (log.data ?? []).filter((r) =>
    (filter === "all" || r.status === filter) &&
    `${r.battle_id ?? ""} ${r.p1_username ?? ""} ${r.p2_username ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())), [log.data, filter, q]);
  const counts = useMemo(() => {
    const c = { ok: 0, skipped: 0, error: 0 };
    for (const r of log.data ?? []) c[r.status]++;
    return c;
  }, [log.data]);

  const cols: Column<EtlFileEntry>[] = [
    { key: "battle", header: "Batalla", primary: true, sortValue: (r) => r.battle_id ?? r.file_name,
      cell: (r) => <span className="font-medium">{r.battle_id ?? r.file_name}</span> },
    { key: "players", header: "Jugadores", cell: (r) => r.p1_username ? `${r.p1_username} vs ${r.p2_username}` : "—" },
    { key: "winner", header: "Ganó", hideOnMobile: true, cell: (r) => r.winner_username ?? "—" },
    { key: "date", header: "Fecha", sortValue: (r) => r.battle_date ?? "", cell: (r) => fmtDate(r.battle_date) },
    { key: "status", header: "Estado", cell: (r) => <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge> },
    { key: "viol", header: "Avisos", align: "right", hideOnMobile: true, sortValue: (r) => r.violation_count, cell: (r) => r.violation_count || "—" },
    { key: "del", header: "", align: "right", cell: (r) => <Button variant="ghost" size="icon-sm" aria-label={`Borrar ${r.battle_id ?? r.file_name}`} onClick={(e) => { e.stopPropagation(); setPending(r); }}><Trash2 /></Button> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ingestas"
        subtitle="Cada batalla que Showdown envía a BATS queda registrada aquí. Puedes borrar una batalla mal cargada o recalcular las estadísticas."
        actions={
          <Button variant="secondary" disabled={maintenance.isPending} onClick={async () => {
            try {
              const r = await maintenance.mutateAsync();
              toast({ title: "Estadísticas recalculadas", description: `${r.seasons.updated} batallas reasignadas a su temporada.`, tone: "success" });
            } catch (e) { toast({ title: "No se pudo recalcular", description: errorMessage(e), tone: "error" }); }
          }}>
            {maintenance.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Recalcular
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Estado" value={filter} onChange={setFilter} options={[
          { value: "all", label: `Todas ${log.data?.length ?? ""}` }, { value: "ok", label: `Cargadas ${counts.ok}` },
          { value: "skipped", label: `Omitidas ${counts.skipped}` }, { value: "error", label: `Errores ${counts.error}` },
        ]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar batalla o jugador" aria-label="Buscar" className="max-w-xs rounded-full" />
      </div>

      {log.isError ? <ErrorState error={log.error} onRetry={() => log.refetch()} /> : (
        <DataList caption="Batallas ingeridas" rows={rows} columns={cols} rowKey={(r) => r.log_id} loading={log.isPending}
          defaultSort={{ key: "date", dir: "desc" }}
          empty={<EmptyState title="Nada que mostrar" description="Cuando Showdown envíe una batalla aparecerá aquí." />} />
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta batalla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina de las estadísticas ({pending?.battle_id ?? pending?.file_name}). El log original sigue en el servidor de Showdown: podrás recuperarla con <code>backfill</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={del.isPending} onClick={async (e) => {
              e.preventDefault();
              try { await del.mutateAsync([pending!.file_path]); toast({ title: "Batalla borrada", tone: "success" }); setPending(null); }
              catch (err) { toast({ title: "No se pudo borrar", description: errorMessage(err), tone: "error" }); }
            }}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
