import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChecklistPanel } from "@/components/team/ChecklistPanel";
import { MonCard } from "@/components/team/MonCard";
import type { PokemonPayload } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useTeamChecklist } from "@/lib/queries";
import { parsePaste } from "@/lib/showdown";
import { resolvePaste, type ParsedMon } from "@/lib/team-resolve";
import { cn } from "@/lib/utils";

interface Props {
  /** Pokémon que ya están en el equipo y siguen contando para las reglas. */
  context: PokemonPayload[];
  /** Cuántos pokémon se pueden agregar como máximo. */
  maxNew: number;
  submitLabel: string;
  onSubmit: (mons: PokemonPayload[]) => Promise<void>;
  placeholder?: string;
}

/**
 * Pega un equipo de Showdown → se resuelve contra PokéAPI → se comprueba en vivo contra las
 * reglas de la temporada → se envía. El botón solo se activa cuando todo cumple.
 */
export function PasteBuilder({ context, maxNew, submitLabel, onSubmit, placeholder }: Props) {
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<ParsedMon[]>([]);
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fresh = useMemo(() => parsed.map((p) => p.payload).filter((p): p is PokemonPayload => !!p), [parsed]);
  const team = useMemo(() => [...context, ...fresh], [context, fresh]);
  const checklist = useTeamChecklist(team);
  const unknown = parsed.filter((p) => !p.payload);
  const tooMany = fresh.length > maxNew;
  const ok = fresh.length > 0 && !tooMany && unknown.length === 0 && !!checklist.data?.ok && !checklist.isPlaceholderData;

  async function read() {
    setError(null);
    const blocks = parsePaste(paste);
    if (!blocks.length) { setParsed([]); setError("No encontramos pokémon. Pega el equipo en formato Showdown."); return; }
    setResolving(true);
    try { setParsed(await resolvePaste(blocks)); }
    catch (e) { setError(errorMessage(e)); }
    finally { setResolving(false); }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try { await onSubmit(fresh); setPaste(""); setParsed([]); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="paste" className="text-footnote font-medium text-muted-foreground">Equipo en formato Showdown</label>
        <textarea
          id="paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} spellCheck={false}
          placeholder={placeholder ?? "Garchomp @ Rocky Helmet\nAbility: Rough Skin\n- Earthquake\n…"}
          className="min-h-40 w-full resize-y rounded-2xl border border-input bg-card p-3.5 font-mono text-footnote outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => void read()} disabled={!paste.trim() || resolving}>
            {resolving ? <><Loader2 className="animate-spin" /> Leyendo…</> : "Leer equipo"}
          </Button>
          {maxNew < 8 && <span className="text-footnote text-muted-foreground">Puedes agregar hasta {maxNew}.</span>}
        </div>
      </div>

      {parsed.length > 0 && (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {parsed.map((p, i) => (
              <MonCard key={`${p.source.species}-${i}`} mon={{ name: p.source.species, sprite_url: p.payload?.sprite_url, types: p.payload?.types, held_item: p.source.held_item, ability: p.source.ability, moves: p.source.moves }}
                className={cn(!p.payload && "ring-destructive/60")}
                badge={!p.payload && <span className="text-caption text-destructive">No reconocido</span>}
                actions={<Button variant="ghost" size="xs" onClick={() => setParsed((cur) => cur.filter((_, j) => j !== i))}><X /> Quitar</Button>} />
            ))}
          </ul>
          {tooMany && <p role="alert" className="text-subhead text-destructive">Son {fresh.length} pokémon y solo caben {maxNew}. Quita alguno.</p>}
          <ChecklistPanel rows={checklist.data?.checklist} pending={checklist.isFetching} empty={team.length === 0} />
        </>
      )}

      {error && <p role="alert" className="text-subhead text-destructive">{error}</p>}
      <Button size="lg" disabled={!ok || busy} onClick={() => void submit()}>
        {busy ? <><Loader2 className="animate-spin" /> Enviando…</> : submitLabel}
      </Button>
    </div>
  );
}
