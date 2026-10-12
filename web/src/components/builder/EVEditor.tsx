import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toId } from "@/lib/dex/snapshot";
import { cn } from "@/lib/utils";

const STAT_META = [
  { id: "hp", label: "HP" },
  { id: "atk", label: "Atk" },
  { id: "def", label: "Def" },
  { id: "spa", label: "SpA" },
  { id: "spd", label: "SpD" },
  { id: "spe", label: "Spe" },
] as const;

/** Repartos habituales: un toque y luego se ajusta a mano. Reemplazan los EVs, no los IVs. */
const PRESETS: { label: string; evs: Record<string, number> }[] = [
  { label: "Atacante físico", evs: { HP: 4, Atk: 252, Spe: 252 } },
  { label: "Atacante especial", evs: { HP: 4, SpA: 252, Spe: 252 } },
  { label: "Muro físico", evs: { HP: 252, Def: 252, SpD: 4 } },
  { label: "Muro especial", evs: { HP: 252, Def: 4, SpD: 252 } },
];

const MAX_TOTAL = 510;
const MAX_EV = 252;
const MAX_IV = 31;

/** Lee una stat sin importar la mayúscula de la clave ("SpA" == "spa"), como checkSet. */
function readStat(rec: Record<string, number>, id: string, fallback: number): number {
  for (const [k, v] of Object.entries(rec)) if (toId(k) === id) return v;
  return fallback;
}

interface Props {
  evs: Record<string, number>;
  ivs: Record<string, number>;
  onChange: (next: { evs: Record<string, number>; ivs: Record<string, number> }) => void;
}

/** Barras de EVs (tope 510 en total, 252 por stat) e IVs plegados, a 31 por defecto. */
export function EVEditor({ evs, ivs, onChange }: Props) {
  const [ivsOpen, setIvsOpen] = useState(false);

  const total = STAT_META.reduce((sum, s) => sum + Math.min(MAX_EV, Math.max(0, readStat(evs, s.id, 0))), 0);
  const remaining = MAX_TOTAL - total;

  function replaceStat(rec: Record<string, number>, id: string, label: string, value: number): Record<string, number> {
    const next = { ...rec };
    for (const k of Object.keys(next)) if (toId(k) === id) delete next[k];
    next[label] = value;
    return next;
  }

  function setEv(id: string, label: string, raw: number) {
    const value = Math.max(0, Math.min(MAX_EV, Math.round(raw)));
    onChange({ evs: replaceStat(evs, id, label, value), ivs });
  }

  function setIv(id: string, label: string, raw: number) {
    const value = Math.max(0, Math.min(MAX_IV, Math.round(raw)));
    onChange({ evs, ivs: replaceStat(ivs, id, label, value) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-footnote">
        <span className="font-medium text-foreground">EVs</span>
        <span className={cn("tabular text-muted-foreground", remaining < 0 && "font-medium text-destructive")}>
          {total}/{MAX_TOTAL}
          {remaining < 0 ? " — pasado del máximo" : remaining > 0 ? ` · quedan ${remaining}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ evs: { ...p.evs }, ivs })}
            className="rounded-full bg-muted px-2.5 py-1 text-caption text-foreground transition-colors hover:bg-accent"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Limpiar EVs"
          onClick={() => onChange({ evs: {}, ivs })}
          className="rounded-full px-2.5 py-1 text-caption text-muted-foreground transition-colors hover:bg-muted"
        >
          Limpiar
        </button>
      </div>

      {STAT_META.map((s) => {
        const value = readStat(evs, s.id, 0);
        return (
          <div key={s.id} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-caption text-muted-foreground">{s.label}</span>
            <input
              type="range"
              min={0}
              max={MAX_EV}
              step={4}
              value={value}
              aria-label={`EVs de ${s.label}`}
              onChange={(e) => setEv(s.id, s.label, Number(e.target.value))}
              className="h-1.5 flex-1 accent-primary"
            />
            <input
              type="number"
              min={0}
              max={MAX_EV}
              value={value}
              aria-label={`EVs de ${s.label} (número)`}
              onChange={(e) => setEv(s.id, s.label, Number(e.target.value))}
              className="w-14 rounded-lg border border-input bg-card px-1.5 py-0.5 text-right text-caption"
            />
          </div>
        );
      })}

      <Collapsible open={ivsOpen} onOpenChange={setIvsOpen}>
        <CollapsibleTrigger className="text-left text-footnote text-muted-foreground underline-offset-2 hover:underline">
          {ivsOpen ? "Ocultar IVs" : "Editar IVs (31 por defecto)"}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-col gap-2">
          {STAT_META.map((s) => {
            const value = readStat(ivs, s.id, MAX_IV);
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-caption text-muted-foreground">{s.label}</span>
                <input
                  type="range"
                  min={0}
                  max={MAX_IV}
                  value={value}
                  aria-label={`IVs de ${s.label}`}
                  onChange={(e) => setIv(s.id, s.label, Number(e.target.value))}
                  className="h-1.5 flex-1 accent-primary"
                />
                <input
                  type="number"
                  min={0}
                  max={MAX_IV}
                  value={value}
                  aria-label={`IVs de ${s.label} (número)`}
                  onChange={(e) => setIv(s.id, s.label, Number(e.target.value))}
                  className="w-14 rounded-lg border border-input bg-card px-1.5 py-0.5 text-right text-caption"
                />
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
