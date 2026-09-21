import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/PageHeader";
import { DataList, type Column } from "@/components/app/DataList";
import { BattleDetail } from "@/components/app/BattleDetail";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteBattle, getBattleDetails, type BattleEntry } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminBattles, useAdminMutation } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/lib/toast";

export function BattlesPage() {
  const battles = useAdminBattles();
  const { toast } = useToast();
  const [selected, setSelected] = useState<BattleEntry | null>(null);
  const [pending, setPending] = useState<BattleEntry | null>(null);
  const del = useAdminMutation(deleteBattle, { stats: true });
  const detail = useQuery({ queryKey: ["battle", selected?.battle_id], queryFn: () => getBattleDetails(selected!.battle_id), enabled: !!selected });

  const cols: Column<BattleEntry>[] = [
    { key: "vs", header: "Batalla", primary: true, sortValue: (r) => r.p1_username, cell: (r) => <span className="font-medium">{r.p1_username} <span className="font-normal text-muted-foreground">vs</span> {r.p2_username}</span> },
    { key: "winner", header: "Ganó", sortValue: (r) => r.winner ?? "", cell: (r) => r.winner ?? "—" },
    { key: "fmt", header: "Formato", hideOnMobile: true, cell: (r) => <Badge variant="secondary">{r.format_name}</Badge> },
    { key: "turns", header: "Turnos", align: "right", sortValue: (r) => r.total_turns, cell: (r) => r.total_turns },
    { key: "date", header: "Fecha", sortValue: (r) => r.battle_date, cell: (r) => <>{fmtDate(r.battle_date)}{r.end_type !== "normal" && <Badge variant="warning" className="ml-2">{r.end_type}</Badge>}</> },
    { key: "del", header: "", align: "right", cell: (r) => <Button variant="ghost" size="icon-sm" aria-label={`Borrar la batalla ${r.p1_username} vs ${r.p2_username}`} onClick={(e) => { e.stopPropagation(); setPending(r); }}><Trash2 /></Button> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Batallas" subtitle="Toca una batalla para ver los pokémon de cada jugador." />
      {battles.isError ? <ErrorState error={battles.error} onRetry={() => battles.refetch()} /> : (
        <DataList caption="Batallas registradas" rows={battles.data ?? []} columns={cols} rowKey={(r) => r.battle_id} loading={battles.isPending}
          defaultSort={{ key: "date", dir: "desc" }} onRowClick={setSelected} empty={<EmptyState title="Sin batallas" description="Aparecerán cuando Showdown las envíe." />} />
      )}

      <ResponsiveSheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)} className="sm:max-w-3xl"
        title={selected ? `${selected.p1_username} vs ${selected.p2_username}` : ""}
        description={selected ? `${fmtDate(selected.battle_date)} · ${selected.total_turns} turnos` : undefined}>
        {selected && <BattleDetail rows={detail.data} loading={detail.isPending} players={[selected.p1_username, selected.p2_username]} winner={selected.winner} />}
      </ResponsiveSheet>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta batalla?</AlertDialogTitle>
            <AlertDialogDescription>{pending?.p1_username} vs {pending?.p2_username} desaparece de las estadísticas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async (e) => {
              e.preventDefault();
              try { await del.mutateAsync(pending!.battle_id); toast({ title: "Batalla borrada", tone: "success" }); setPending(null); }
              catch (err) { toast({ title: "No se pudo borrar", description: errorMessage(err), tone: "error" }); }
            }}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
