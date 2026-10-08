import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Group, GroupRow } from "@/components/app/Group";
import { Meter } from "@/components/app/Meter";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { EmptyState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { addSeasonWhitelist, removeSeasonWhitelist } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminMutation, useAdminPlayers, useSeasonVotes, useSeasonWhitelist } from "@/lib/queries";
import { useToast } from "@/lib/toast";

/** Quién puede votar en una temporada y cómo va el ranking de votos. */
export function SeasonPeople({ seasonId }: { seasonId: number }) {
  const [tab, setTab] = useState<"whitelist" | "votes">("whitelist");
  const wl = useSeasonWhitelist(seasonId);
  const votes = useSeasonVotes(seasonId);
  const accounts = useAdminPlayers();
  const { toast } = useToast();
  const [name, setName] = useState<string | null>(null);
  const add = useAdminMutation((u: string) => addSeasonWhitelist(seasonId, u));
  const remove = useAdminMutation((hash: string) => removeSeasonWhitelist(seasonId, hash));
  const total = (votes.data ?? []).reduce((a, v) => a + v.total_votes, 0);

  // Solo se puede votar con una cuenta de la liga (require_player resuelve el username en
  // tournament.player_accounts), así que la whitelist se elige de ahí: ni typos ni gente que
  // nunca podría votar. Las que ya están dentro no se ofrecen (evita el 409 del servidor).
  const registered = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.username.toLowerCase(), a])),
    [accounts.data],
  );
  const options = useMemo<ComboboxItem[]>(() => {
    const already = new Set((wl.data ?? []).map((p) => p.username.toLowerCase()));
    return (accounts.data ?? [])
      .filter((a) => !already.has(a.username.toLowerCase()))
      .map((a) => ({ id: a.username.toLowerCase(), label: a.username, sublabel: a.email, keywords: a.email }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [accounts.data, wl.data]);

  const picked = name ? registered.get(name) : undefined;
  const pickerHint = accounts.isPending ? "Cargando jugadores…"
    : accounts.isError ? "No se pudo cargar la lista de jugadores."
    : !accounts.data?.length ? "No hay cuentas registradas: créalas en Jugadores."
    : !options.length ? "Todas las cuentas ya están en la whitelist."
    : picked ? `Vas a agregar a ${picked.username} (${picked.email}).`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl label="Vista" value={tab} onChange={setTab} options={[
        { value: "whitelist", label: `Whitelist ${wl.data?.length ?? ""}` }, { value: "votes", label: `Votos ${total || ""}` },
      ]} />

      {tab === "whitelist" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!name) return;
              try { await add.mutateAsync(name); setName(null); }
              catch (err) { toast({ title: "No se pudo agregar", description: errorMessage(err), tone: "error" }); }
            }}>
              <Combobox
                items={options} value={name} onChange={setName}
                placeholder="Buscar jugador por usuario o email"
                emptyText="Ningún jugador coincide"
                disabled={!options.length}
                className="flex-1" inputClassName="rounded-full"
              />
              <Button type="submit" disabled={!name || add.isPending}>Agregar</Button>
            </form>
            {pickerHint && <p className="px-1 text-footnote text-muted-foreground">{pickerHint}</p>}
          </div>
          <Group>
            {!wl.data?.length ? <EmptyState title="Nadie en la whitelist" description="Agrega a los jugadores que pueden votar." /> :
              wl.data.map((p) => (
                <GroupRow key={p.voter_hash} title={p.username}
                  subtitle={registered.size > 0 && !registered.has(p.username.toLowerCase())
                    ? "Sin cuenta en la liga: no va a poder votar"
                    : p.voted ? "Ya votó" : "Aún no vota"}
                  trailing={<span className="flex items-center gap-2">
                    {registered.size > 0 && !registered.has(p.username.toLowerCase()) && <Badge variant="warning">Sin cuenta</Badge>}
                    <Badge variant={p.voted ? "success" : "secondary"}>{p.voted ? "Votó" : "Pendiente"}</Badge>
                    <Button variant="ghost" size="icon-sm" disabled={p.voted} aria-label={`Quitar a ${p.username}`}
                      onClick={async () => { try { await remove.mutateAsync(p.voter_hash); } catch (err) { toast({ title: "No se pudo quitar", description: errorMessage(err), tone: "error" }); } }}><Trash2 /></Button>
                  </span>} />
              ))}
          </Group>
        </>
      ) : (
        <Group>
          {!votes.data?.length ? <EmptyState title="Sin votos" /> : votes.data.map((v) => (
            <GroupRow key={v.pokemon_name} leading={<PokemonSprite species={v.pokemon_name} src={v.sprite_url} size={40} />} title={v.pokemon_name}
              subtitle={<Meter label={`Votos de ${v.pokemon_name}`} value={v.total_votes} max={Math.max(1, total)} className="mt-1.5" />}
              trailing={<span className="tabular text-subhead font-medium">{v.total_votes}</span>} />
          ))}
        </Group>
      )}
    </div>
  );
}
