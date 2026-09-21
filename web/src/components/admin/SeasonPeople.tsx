import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Group, GroupRow } from "@/components/app/Group";
import { Meter } from "@/components/app/Meter";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { EmptyState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSeasonWhitelist, removeSeasonWhitelist } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useAdminMutation, useSeasonVotes, useSeasonWhitelist } from "@/lib/queries";
import { useToast } from "@/lib/toast";

/** Quién puede votar en una temporada y cómo va el ranking de votos. */
export function SeasonPeople({ seasonId }: { seasonId: number }) {
  const [tab, setTab] = useState<"whitelist" | "votes">("whitelist");
  const wl = useSeasonWhitelist(seasonId);
  const votes = useSeasonVotes(seasonId);
  const { toast } = useToast();
  const [name, setName] = useState("");
  const add = useAdminMutation((u: string) => addSeasonWhitelist(seasonId, u));
  const remove = useAdminMutation((hash: string) => removeSeasonWhitelist(seasonId, hash));
  const total = (votes.data ?? []).reduce((a, v) => a + v.total_votes, 0);

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl label="Vista" value={tab} onChange={setTab} options={[
        { value: "whitelist", label: `Whitelist ${wl.data?.length ?? ""}` }, { value: "votes", label: `Votos ${total || ""}` },
      ]} />

      {tab === "whitelist" ? (
        <>
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            try { await add.mutateAsync(name.trim().toLowerCase()); setName(""); }
            catch (err) { toast({ title: "No se pudo agregar", description: errorMessage(err), tone: "error" }); }
          }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Usuario de Showdown" aria-label="Usuario de Showdown" autoComplete="off" className="rounded-full" />
            <Button type="submit" disabled={!name.trim() || add.isPending}>Agregar</Button>
          </form>
          <Group>
            {!wl.data?.length ? <EmptyState title="Nadie en la whitelist" description="Agrega a los jugadores que pueden votar." /> :
              wl.data.map((p) => (
                <GroupRow key={p.voter_hash} title={p.username} subtitle={p.voted ? "Ya votó" : "Aún no vota"}
                  trailing={<span className="flex items-center gap-2">
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
