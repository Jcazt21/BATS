import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlayerAccount } from "@/lib/api";

export interface PlayerAccountFormValues {
  email: string;
  username: string;
  is_admin: boolean;
}

/** Crear o editar una cuenta de jugador. Mismo formulario para las dos, como SeasonForm. */
export function PlayerAccountForm({ account, busy, error, onSubmit }: {
  account?: PlayerAccount; busy: boolean; error?: string | null; onSubmit: (v: PlayerAccountFormValues) => void;
}) {
  const [v, setV] = useState<PlayerAccountFormValues>({
    email: account?.email ?? "", username: account?.username ?? "", is_admin: account?.is_admin ?? false,
  });
  const set = <K extends keyof PlayerAccountFormValues>(k: K, val: PlayerAccountFormValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  const emailChanged = !!account && v.email.trim().toLowerCase() !== account.email.toLowerCase();
  const usernameChanged = !!account && v.username.trim().toLowerCase() !== account.username.toLowerCase();

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="flex flex-col gap-4 pb-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pa-email" className="text-footnote font-medium">Correo</label>
        <Input id="pa-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} required autoComplete="off" />
        {emailChanged && account.is_linked && (
          <p className="text-caption text-muted-foreground">
            Al cambiar el correo se desenlaza el login actual. {account.username} volverá a enlazarse solo al entrar con el correo nuevo.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pa-username" className="text-footnote font-medium">Usuario de Showdown</label>
        <Input id="pa-username" value={v.username} onChange={(e) => set("username", e.target.value)} required autoComplete="off" />
        {usernameChanged && (
          <p className="text-caption text-muted-foreground">
            Esto mueve su equipo, sus bans y su whitelist de "{account.username}" a "{v.username.trim()}" en cada temporada donde tenga datos.
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-subhead">
        <input type="checkbox" checked={v.is_admin} onChange={(e) => set("is_admin", e.target.checked)} className="size-4 accent-primary" />
        Es administrador
      </label>
      {error && <p role="alert" className="text-subhead text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={busy || !v.email.trim() || !v.username.trim()}>
        {busy ? <><Loader2 className="animate-spin" /> Guardando…</> : account ? "Guardar cambios" : "Agregar"}
      </Button>
    </form>
  );
}
