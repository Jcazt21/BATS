import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { addPlayerAccount, deletePlayerAccount, type PlayerAccount } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminMutation, useAdminPlayers } from "@/lib/queries";
import { useToast } from "@/lib/toast";

export function PlayersPage() {
  const players = useAdminPlayers();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [target, setTarget] = useState<PlayerAccount | null>(null);

  const add = useAdminMutation(addPlayerAccount);
  const del = useAdminMutation(deletePlayerAccount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await add.mutateAsync({ email, username, is_admin: isAdmin });
      toast({ title: "Cuenta creada", description: `${username} ya puede entrar con ${email.trim().toLowerCase()}.`, tone: "success" });
      setEmail(""); setUsername(""); setIsAdmin(false);
    } catch (err) { toast({ title: "No se pudo crear", description: errorMessage(err), tone: "error" }); }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader title="Jugadores" subtitle="Cada jugador entra con el correo que registres aquí y queda vinculado a su usuario de Showdown." />

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
        <h2 className="text-headline">Dar de alta</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="email" placeholder="correo@ejemplo.com" aria-label="Correo" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          <Input placeholder="Usuario de Showdown" aria-label="Usuario de Showdown" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </div>
        <label className="flex items-center gap-2 text-subhead">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="size-4 accent-primary" />
          Es administrador
        </label>
        <Button type="submit" className="self-start" disabled={add.isPending || !email.trim() || !username.trim()}>
          {add.isPending ? <Loader2 className="animate-spin" /> : "Agregar"}
        </Button>
      </form>

      {players.isError ? <ErrorState error={players.error} onRetry={() => players.refetch()} /> : (
        <Group title="Cuentas">
          {players.isPending ? <div className="p-4 text-subhead text-muted-foreground" aria-busy>Cargando…</div> :
            !players.data.length ? <EmptyState title="Aún no hay cuentas" /> :
            players.data.map((a) => (
              <GroupRow key={a.account_id} leading={<PlayerAvatar name={a.username} />} title={a.username} subtitle={a.email}
                trailing={<span className="flex items-center gap-2">
                  {a.is_admin && <Badge>Admin</Badge>}
                  <Badge variant={a.has_logged_in ? "success" : "secondary"}>{a.has_logged_in ? "Activa" : "Sin entrar"}</Badge>
                  <Button variant="ghost" size="icon-sm" aria-label={`Eliminar a ${a.username}`} onClick={() => setTarget(a)}><Trash2 /></Button>
                </span>} />
            ))}
        </Group>
      )}

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la cuenta de {target?.username}?</AlertDialogTitle>
            <AlertDialogDescription>Perderá el acceso. No se borran sus batallas ni su equipo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async (e) => {
              e.preventDefault();
              try { await del.mutateAsync(target!.account_id); setTarget(null); toast({ title: "Cuenta eliminada", tone: "success" }); }
              catch (err) { toast({ title: "No se pudo eliminar", description: errorMessage(err), tone: "error" }); }
            }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
