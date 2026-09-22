import { useState } from "react";
import { Link, Link2Off, MoreHorizontal, Pencil, Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { EmptyState, ErrorState } from "@/components/app/States";
import { OrphanLogins } from "@/components/admin/OrphanLogins";
import { PlayerAccountForm, type PlayerAccountFormValues } from "@/components/admin/PlayerAccountForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { addPlayerAccount, deletePlayerAccount, updatePlayerAccount, type PlayerAccount } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminMutation, useAdminPlayers } from "@/lib/queries";
import { useToast } from "@/lib/toast";

type Dialog = { kind: "create" } | { kind: "edit" | "delete" | "unlink"; account: PlayerAccount } | null;

export function PlayersPage() {
  const players = useAdminPlayers();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const add = useAdminMutation(addPlayerAccount);
  const update = useAdminMutation(
    (v: { id: number; payload: Parameters<typeof updatePlayerAccount>[1] }) => updatePlayerAccount(v.id, v.payload),
  );
  const del = useAdminMutation(deletePlayerAccount);

  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    try { await fn(); toast({ title: label, tone: "success" }); after?.(); }
    catch (e) { toast({ title: "No se pudo completar", description: errorMessage(e), tone: "error" }); }
  };

  async function submitForm(v: PlayerAccountFormValues) {
    setFormError(null);
    const email = v.email.trim().toLowerCase();
    const username = v.username.trim();
    try {
      if (dialog?.kind === "edit") {
        const res = await update.mutateAsync({ id: dialog.account.account_id, payload: { email, username, is_admin: v.is_admin } });
        const moved = Object.values(res.cascade).reduce((a, b) => a + b, 0);
        toast({
          title: "Cuenta actualizada",
          description:
            moved > 0 ? `Se movieron ${moved} registros (equipo, bans o whitelist) al nombre nuevo.`
            : res.user_id_cleared ? `${username} tendrá que volver a entrar con su correo nuevo para re-enlazarse.`
            : undefined,
          tone: "success",
        });
      } else {
        await add.mutateAsync({ email, username, is_admin: v.is_admin });
        toast({ title: "Cuenta creada", description: `${username} ya puede entrar con ${email}.`, tone: "success" });
      }
      setDialog(null);
    } catch (e) { setFormError(errorMessage(e)); }
  }

  const accounts = players.data ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Jugadores"
        subtitle="Cada jugador entra con el correo que registres aquí y queda vinculado a su usuario de Showdown."
        actions={<Button onClick={() => { setFormError(null); setDialog({ kind: "create" }); }}><UserPlus /> Nueva cuenta</Button>}
      />

      {players.isError ? <ErrorState error={players.error} onRetry={() => players.refetch()} /> : (
        <Group title="Cuentas">
          {players.isPending ? <div className="p-4 text-subhead text-muted-foreground" aria-busy>Cargando…</div> :
            !accounts.length ? <EmptyState title="Aún no hay cuentas" /> :
            accounts.map((a) => (
              <GroupRow key={a.account_id} leading={<PlayerAvatar name={a.username} />} title={a.username} subtitle={a.email}
                trailing={<span className="flex items-center gap-2">
                  {a.is_admin && <Badge>Admin</Badge>}
                  {a.is_linked ? (
                    <Badge variant="success" title="Cuenta enlazada" aria-label="Cuenta enlazada" className="px-1.5">
                      <Link className="size-3" aria-hidden />
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Sin enlazar</Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${a.username}`} />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                      <DropdownMenuItem onClick={() => { setFormError(null); setDialog({ kind: "edit", account: a }); }}>
                        <Pencil /> Editar
                      </DropdownMenuItem>
                      {a.is_linked && (
                        <DropdownMenuItem onClick={() => setDialog({ kind: "unlink", account: a })}>
                          <Link2Off /> Desenlazar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: "delete", account: a })}>
                        <Trash2 /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>} />
            ))}
        </Group>
      )}

      {!players.isError && !players.isPending && <OrphanLogins accounts={accounts} />}

      <ResponsiveSheet
        open={dialog?.kind === "create" || dialog?.kind === "edit"} onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "edit" ? "Editar cuenta" : "Nueva cuenta"}
      >
        {(dialog?.kind === "create" || dialog?.kind === "edit") && (
          <PlayerAccountForm
            key={dialog.kind === "edit" ? dialog.account.account_id : "new"}
            account={dialog.kind === "edit" ? dialog.account : undefined}
            busy={add.isPending || update.isPending} error={formError}
            onSubmit={(v) => void submitForm(v)}
          />
        )}
      </ResponsiveSheet>

      <AlertDialog open={dialog?.kind === "delete" || dialog?.kind === "unlink"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.kind === "delete" ? `¿Eliminar la cuenta de ${dialog.account.username}?` : `¿Desenlazar la cuenta de ${dialog?.kind === "unlink" ? dialog.account.username : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "delete"
                ? "Perderá el acceso. No se borran su equipo ni sus batallas."
                : "Mantiene su equipo y sus batallas; volverá a enlazarse solo al entrar con su correo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant={dialog?.kind === "delete" ? "destructive" : "default"} onClick={(e) => {
              e.preventDefault();
              if (dialog?.kind !== "delete" && dialog?.kind !== "unlink") return;
              const account = dialog.account;
              if (dialog.kind === "delete") {
                void run("Cuenta eliminada", () => del.mutateAsync(account.account_id), () => setDialog(null));
              } else {
                void run("Cuenta desenlazada", () => update.mutateAsync({ id: account.account_id, payload: { clear_user_id: true } }), () => setDialog(null));
              }
            }}>
              {dialog?.kind === "delete" ? "Eliminar" : "Desenlazar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
