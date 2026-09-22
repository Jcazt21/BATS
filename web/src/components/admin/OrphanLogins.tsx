import { useState } from "react";
import { Link2 } from "lucide-react";
import { Group, GroupRow } from "@/components/app/Group";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPlayerAccount, updatePlayerAccount, type AuthLogin, type PlayerAccount } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { fmtDate } from "@/lib/format";
import { useAdminMutation, useAuthLogins } from "@/lib/queries";
import { useToast } from "@/lib/toast";

const selectCls = "h-9 rounded-lg border border-input bg-card px-2 text-footnote outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * Personas que entraron con Google/magic link pero no tienen cuenta en la liga
 * (o cuya cuenta tiene otro correo). No se muestra nada en Postgres local: ahí
 * no existe el esquema `auth` de Supabase (GET /api/admin/auth-logins responde
 * `available: false`).
 */
export function OrphanLogins({ accounts }: { accounts: PlayerAccount[] }) {
  const logins = useAuthLogins();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [linkTo, setLinkTo] = useState("");

  const link = useAdminMutation((v: { id: number; payload: Parameters<typeof updatePlayerAccount>[1] }) => updatePlayerAccount(v.id, v.payload));
  const create = useAdminMutation(addPlayerAccount);

  if (!logins.data || !logins.data.available) return null;
  const orphans = logins.data.logins.filter((l) => !l.linked_account_id);

  function collapse() {
    setExpanded(null); setUsername(""); setLinkTo("");
  }

  async function linkExisting(login: AuthLogin) {
    if (!linkTo) return;
    try {
      await link.mutateAsync({ id: Number(linkTo), payload: { email: login.email, link_user_id: login.user_id } });
      toast({ title: "Login enlazado", tone: "success" });
      collapse();
    } catch (e) { toast({ title: "No se pudo enlazar", description: errorMessage(e), tone: "error" }); }
  }

  async function createNew(login: AuthLogin) {
    if (!username.trim()) return;
    try {
      await create.mutateAsync({ email: login.email, username: username.trim(), is_admin: false, user_id: login.user_id });
      toast({ title: "Cuenta creada y enlazada", tone: "success" });
      collapse();
    } catch (e) { toast({ title: "No se pudo crear", description: errorMessage(e), tone: "error" }); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-headline">Entraron sin cuenta</h2>
        <p className="text-footnote text-muted-foreground">Personas que entraron con Google pero no tienen cuenta en la liga.</p>
      </div>
      {orphans.length === 0 ? (
        <p className="rounded-2xl bg-card p-4 text-subhead text-muted-foreground shadow-sm ring-1 ring-border">
          Todos los logins tienen cuenta.
        </p>
      ) : (
        <Group>
          {orphans.map((login) => (
            <GroupRow
              key={login.user_id}
              leading={<PlayerAvatar name={login.full_name || login.email} />}
              title={login.full_name || login.email}
              subtitle={`${login.email} · ${login.provider ?? "?"} · entró ${fmtDate(login.last_sign_in_at)}`}
              trailing={
                expanded === login.user_id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className={selectCls}>
                      <option value="">Enlazar a…</option>
                      {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.username}</option>)}
                    </select>
                    <Button size="xs" variant="secondary" disabled={!linkTo || link.isPending} onClick={() => void linkExisting(login)}>
                      Enlazar
                    </Button>
                    <Input
                      value={username} onChange={(e) => setUsername(e.target.value)}
                      placeholder="Usuario nuevo" className="h-9 w-32"
                    />
                    <Button size="xs" disabled={!username.trim() || create.isPending} onClick={() => void createNew(login)}>
                      Crear
                    </Button>
                    <Button size="xs" variant="ghost" onClick={collapse}>Cancelar</Button>
                  </div>
                ) : (
                  <Button size="xs" variant="secondary" onClick={() => { setExpanded(login.user_id); setUsername(""); setLinkTo(""); }}>
                    <Link2 /> Enlazar
                  </Button>
                )
              }
            />
          ))}
        </Group>
      )}
    </div>
  );
}
