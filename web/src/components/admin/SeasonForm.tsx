import { useState } from "react";
import { Loader2 } from "lucide-react";
import { RestrictionField } from "@/components/RestrictionField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_RESTRICTION_SPEC, type SeasonEntry, type SeasonRestrictions } from "@/lib/api";
import { POKEMON_TYPES, typeLabel } from "@/lib/pokemon-types";

export interface SeasonFormValues {
  season_name: string; type_of_month: string; start_date: string; end_date: string;
  max_team_size: number; max_team_changes: number; restrictions: SeasonRestrictions;
}

const selectCls = "h-10 w-full rounded-xl border border-input bg-card px-3 text-subhead outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/** Crear o editar una temporada. Las restricciones salen del spec: añadir una regla no toca este formulario. */
export function SeasonForm({ season, busy, error, onSubmit }: {
  season?: SeasonEntry; busy: boolean; error?: string | null; onSubmit: (v: SeasonFormValues) => void;
}) {
  const [v, setV] = useState<SeasonFormValues>({
    season_name: season?.season_name ?? "", type_of_month: season?.type_of_month ?? "Ice",
    start_date: season?.start_date ?? new Date().toISOString().slice(0, 10), end_date: season?.end_date ?? "",
    max_team_size: season?.max_team_size ?? 8, max_team_changes: season?.max_team_changes ?? 4,
    restrictions: season?.restrictions ?? {},
  });
  const set = <K extends keyof SeasonFormValues>(k: K, val: SeasonFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="flex flex-col gap-5 pb-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sn" className="text-footnote font-medium">Nombre</label>
        <Input id="sn" value={v.season_name} onChange={(e) => set("season_name", e.target.value)} required maxLength={100} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="st" className="text-footnote font-medium">Tipo del mes</label>
          <select id="st" value={v.type_of_month} onChange={(e) => set("type_of_month", e.target.value)} className={selectCls}>
            {POKEMON_TYPES.map((t) => <option key={t} value={t.charAt(0).toUpperCase() + t.slice(1)}>{typeLabel(t)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sd" className="text-footnote font-medium">Inicio</label>
          <Input id="sd" type="date" value={v.start_date} onChange={(e) => set("start_date", e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ed" className="text-footnote font-medium">Fin (opcional)</label>
          <Input id="ed" type="date" value={v.end_date} onChange={(e) => set("end_date", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ms" className="text-footnote font-medium">Pokémon por equipo</label>
          <Input id="ms" type="number" min={1} value={v.max_team_size} onChange={(e) => set("max_team_size", Number(e.target.value))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc" className="text-footnote font-medium">Rotaciones</label>
          <Input id="mc" type="number" min={0} value={v.max_team_changes} onChange={(e) => set("max_team_changes", Number(e.target.value))} />
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-2xl bg-secondary/50 p-4">
        <h3 className="text-footnote font-medium uppercase tracking-wide text-muted-foreground">Restricciones</h3>
        {Object.entries(DEFAULT_RESTRICTION_SPEC).map(([key, spec]) => (
          <RestrictionField key={key} rkey={key} spec={spec} value={v.restrictions[key]} onChange={(k, val) => set("restrictions", { ...v.restrictions, [k]: val })} />
        ))}
      </div>
      {error && <p role="alert" className="text-subhead text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={busy || !v.season_name.trim()}>
        {busy ? <><Loader2 className="animate-spin" /> Guardando…</> : season ? "Guardar cambios" : "Crear temporada"}
      </Button>
    </form>
  );
}
