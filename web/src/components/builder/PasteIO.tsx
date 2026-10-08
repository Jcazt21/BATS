import { useState } from "react";
import { ClipboardCopy, Import } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DexEssentials } from "@/lib/dex/snapshot";
import { speciesById } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";
import { parsePaste, toPaste } from "@/lib/showdown";
import { useToast } from "@/lib/toast";

interface Props {
  dex: DexEssentials;
  team: BuilderMon[];
  maxSize: number;
  onImport: (mons: BuilderMon[]) => void;
  placeholder?: string;
}

/**
 * Importar/exportar un equipo en formato Showdown. A diferencia del PasteBuilder anterior,
 * las especies se resuelven contra el snapshot local del dex (Task 10), no contra PokéAPI:
 * sin red, y con los mismos ids que usa config/formats.ts.
 */
export function PasteIO({ dex, team, maxSize, onImport, placeholder }: Props) {
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function importPaste() {
    setError(null);
    const blocks = parsePaste(paste);
    if (!blocks.length) {
      setError("No encontramos pokémon. Pega el equipo en formato Showdown.");
      return;
    }
    const unknown = blocks.filter((b) => !speciesById(dex, b.species));
    if (unknown.length) {
      setError(`No reconocemos: ${unknown.map((u) => u.species).join(", ")}.`);
      return;
    }
    if (blocks.length > maxSize) {
      setError(`Son ${blocks.length} pokémon y el máximo es ${maxSize}. Quita alguno del paste.`);
      return;
    }
    onImport(blocks.map((b): BuilderMon => ({
      species: speciesById(dex, b.species)!.name,
      held_item: b.held_item ?? null,
      ability: b.ability ?? null,
      nature: b.nature ?? null,
      tera_type: b.tera_type ?? null,
      moves: b.moves,
      evs: b.evs,
      ivs: b.ivs,
    })));
    setPaste("");
  }

  async function copy() {
    const text = team
      .map((m) => toPaste({
        name: speciesById(dex, m.species)?.name ?? m.species,
        held_item: m.held_item, ability: m.ability, nature: m.nature, tera_type: m.tera_type,
        evs: m.evs, ivs: m.ivs, moves: m.moves,
      }))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado", description: "Tu equipo está en el portapapeles en formato Showdown.", tone: "success" });
    } catch {
      toast({ title: "No se pudo copiar", tone: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={placeholder ?? "Garchomp @ Rocky Helmet\nAbility: Rough Skin\n- Earthquake\n…"}
        className="min-h-32 w-full resize-y rounded-2xl border border-input bg-card p-3.5 font-mono text-footnote outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={importPaste} disabled={!paste.trim()}>
          <Import /> Importar
        </Button>
        <Button variant="secondary" onClick={() => void copy()} disabled={!team.length}>
          <ClipboardCopy /> Copiar equipo
        </Button>
      </div>
      {error && <p role="alert" className="text-footnote text-destructive">{error}</p>}
    </div>
  );
}
