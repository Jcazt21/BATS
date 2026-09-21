import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { EmptyState } from "@/components/app/States";
import { SignInCard } from "@/components/SignInCard";
import { errorMessage } from "@/lib/http";
import { useEligibility, useSubmitBan } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { getPokemonDetail, loadAllPokemon, searchPokemon, type PokeResult } from "@/lib/pokeapi";
import { useToast } from "@/lib/toast";

const sprite = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const titleCase = (s: string) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");

/** Tu voto (anónimo): iniciar sesión → comprobar que puedes votar → elegir → confirmar. */
export function VoteFlow() {
  const { session, loading } = useSession();
  const elig = useEligibility();
  const submit = useSubmitBan();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PokeResult | null>(null);
  const [loadingPick, setLoadingPick] = useState(false);
  const [done, setDone] = useState<PokeResult | null>(null);
  const [catalog, setCatalog] = useState(0);

  useEffect(() => { void loadAllPokemon().then(() => setCatalog((n) => n + 1)); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo(() => searchPokemon(q, 12), [q, catalog]);

  if (loading) return null;
  if (!session) return <div className="flex justify-center"><SignInCard title="Vota en la fase de bans" description="Tu voto es anónimo: el servidor solo guarda que ya votaste, no por quién." /></div>;

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
        <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} />
        <PokemonSprite species={done.displayName} src={done.sprite} size={96} />
        <h3 className="text-title3">Voto registrado</h3>
        <p className="text-subhead text-muted-foreground">Votaste por banear a {done.displayName}. Solo se permite un voto por jugador.</p>
      </div>
    );
  }

  if (elig.isPending) return <p className="text-subhead text-muted-foreground" aria-busy>Verificando tu cuenta…</p>;
  if (elig.isError) return <EmptyState title="No pudimos verificar tu cuenta" description={errorMessage(elig.error)} action={<Button variant="secondary" onClick={() => elig.refetch()}>Reintentar</Button>} />;
  if (!elig.data.can_vote) {
    return (
      <EmptyState
        title={elig.data.reason === "already_voted" ? "Ya votaste" : "Tu cuenta no está en la whitelist"}
        description={elig.data.reason === "already_voted" ? "Solo se permite un voto por jugador en cada temporada." : "Pídele al administrador que te agregue a esta temporada."}
      />
    );
  }

  async function pick(r: { id: number }) {
    setLoadingPick(true);
    try { setPicked(await getPokemonDetail(r.id)); }
    catch { toast({ title: "No se pudo cargar el pokémon", tone: "error" }); }
    finally { setLoadingPick(false); }
  }

  async function confirm() {
    if (!picked) return;
    try {
      await submit.mutateAsync({ pokemon_name: picked.displayName, pokemon_types: picked.types, sprite_url: picked.sprite, national_dex: picked.id });
      setDone(picked);
      setPicked(null);
    } catch (e) {
      toast({ title: "No se registró tu voto", description: errorMessage(e), tone: "error" });
      setPicked(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca el pokémon que quieres banear" aria-label="Buscar pokémon" className="rounded-full pl-10" autoComplete="off" />
      </div>
      {q.trim() && (
        results.length === 0 ? <p className="px-1 text-subhead text-muted-foreground">Sin resultados para “{q}”.</p> : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Resultados">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" disabled={loadingPick} onClick={() => void pick(r)}
                  className="press flex w-full items-center gap-2 rounded-2xl bg-card p-2.5 text-left shadow-sm ring-1 ring-border outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                  <PokemonSprite species={r.name} src={sprite(r.id)} size={40} />
                  <span className="truncate text-subhead font-medium">{titleCase(r.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      <AlertDialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Votar por banear a {picked?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>No podrás cambiar tu voto después.</AlertDialogDescription>
          </AlertDialogHeader>
          {picked && (
            <div className="flex items-center gap-3">
              <PokemonSprite species={picked.displayName} src={picked.sprite} size={72} />
              <TypeBadges types={picked.types} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={submit.isPending} onClick={(e) => { e.preventDefault(); void confirm(); }}>
              {submit.isPending ? "Enviando…" : "Confirmar voto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
