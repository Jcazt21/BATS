import { useState } from "react";
import { ChevronUp, Loader2, Plus, X } from "lucide-react";
import { MonCard } from "@/components/team/MonCard";
import { ChecklistPanel } from "@/components/team/ChecklistPanel";
import { PasteIO } from "@/components/builder/PasteIO";
import { SetEditor } from "@/components/builder/SetEditor";
import { SpeciesPicker, type SpeciesHint } from "@/components/builder/SpeciesPicker";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Dex } from "@/lib/dex/snapshot";
import { speciesById } from "@/lib/dex/snapshot";
import { useLearnset, useLearnsets } from "@/lib/dex/useLearnset";
import { checkSet, checkTeam, type BuilderMon, type RuleSeason } from "@/lib/dex/validate";
import { errorMessage } from "@/lib/http";
import { cn } from "@/lib/utils";

interface Props {
  dex: Dex;
  initial: BuilderMon[];
  /**
   * Pokémon ya registrados que no se editan aquí pero SÍ cuentan para las reglas de
   * conjunto (item clause, color/generación/egg group requeridos...). Se usa al agregar
   * o reemplazar: `maxSize` es el espacio libre, no el tamaño total del equipo.
   */
  context?: BuilderMon[];
  season: RuleSeason;
  banned: Set<string>;
  maxSize: number;
  onSave: (team: BuilderMon[]) => Promise<void>;
  saveLabel?: string;
}

function buildHint(rows: ReturnType<typeof checkTeam>["rows"], season: RuleSeason): SpeciesHint | null {
  const failed = (rule: string) => rows.some((r) => r.rule === rule && !r.ok);
  if (failed("type_of_month") && season.type_of_month) {
    return { label: `Te falta un pokémon de tipo ${season.type_of_month}. Toca aquí para filtrar.`, filters: { type: season.type_of_month } };
  }
  if (failed("required_color") && season.restrictions.required_color) {
    return { label: `Te falta un pokémon de color ${season.restrictions.required_color}. Toca aquí para filtrar.`, filters: { color: season.restrictions.required_color } };
  }
  if (failed("required_generation") && season.restrictions.required_generation) {
    return { label: `Te falta un pokémon de la generación ${season.restrictions.required_generation}. Toca aquí para filtrar.`, filters: { gen: season.restrictions.required_generation } };
  }
  if (failed("required_egg_group") && season.restrictions.required_egg_group) {
    return { label: `Te falta un pokémon del Egg Group ${season.restrictions.required_egg_group}. Toca aquí para filtrar.`, filters: { eggGroup: season.restrictions.required_egg_group } };
  }
  return null;
}

/**
 * Teambuilder completo: hasta `maxSize` pokémon (izquierda), el set del seleccionado
 * (derecha, SetEditor), reglas de la temporada en vivo (ChecklistPanel) y paste
 * import/export (PasteIO). `onSave` decide qué hace el llamador con el pool final
 * (registrar, agregar, reemplazar): TeamBuilder no conoce la API.
 */
export function TeamBuilder({ dex, initial, context = [], season, banned, maxSize, onSave, saveLabel = "Guardar" }: Props) {
  const [team, setTeam] = useState<BuilderMon[]>(initial);
  const [selected, setSelected] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const combined = [...context, ...team];
  const { rows } = checkTeam(dex, combined, season, banned, false);
  const hint = buildHint(rows, season);

  const speciesIds = team.map((m) => speciesById(dex, m.species)?.id).filter((id): id is string => !!id);
  const learnsets = useLearnsets(speciesIds);
  const teamOk = team.length > 0 && team.every((m) => {
    const id = speciesById(dex, m.species)?.id;
    return id ? checkSet(dex, learnsets[id] ?? [], m).length === 0 : false;
  });

  const selectedMon = team[selected] ?? null;
  const selectedSpecies = selectedMon ? speciesById(dex, selectedMon.species) : null;
  const selectedLearnset = useLearnset(selectedSpecies?.id ?? null);
  const selectedErrors = selectedMon ? checkSet(dex, selectedLearnset, selectedMon) : [];

  function updateSelected(mon: BuilderMon) {
    setTeam((cur) => cur.map((m, i) => (i === selected ? mon : m)));
  }

  function removeAt(index: number) {
    setTeam((cur) => cur.filter((_, i) => i !== index));
    setSelected((cur) => (cur >= index ? Math.max(0, cur - 1) : cur));
  }

  function importMons(mons: BuilderMon[]) {
    setTeam(mons);
    setSelected(0);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(team);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const passedCount = rows.filter((r) => r.ok).length;

  return (
    <div className="flex flex-col gap-6 pb-24 sm:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2" aria-label="Pokémon del equipo">
            {team.map((m, i) => {
              const sp = speciesById(dex, m.species);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    className={cn(
                      "w-full rounded-2xl text-left ring-1 ring-border transition-shadow",
                      i === selected && "ring-2 ring-primary",
                    )}
                  >
                    <MonCard
                      mon={{ name: sp?.name ?? m.species, types: sp?.types.join(" / "), held_item: m.held_item, ability: m.ability, moves: m.moves }}
                      banned={!!sp && banned.has(sp.name.toLowerCase())}
                      actions={
                        <Button
                          variant="ghost" size="xs"
                          onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                        >
                          <X /> Quitar
                        </Button>
                      }
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          {team.length < maxSize && (
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              <Plus /> Agregar pokémon
            </Button>
          )}

          <PasteIO dex={dex} team={team} maxSize={maxSize} onImport={importMons} />
        </div>

        <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
          {selectedMon ? (
            <SetEditor mon={selectedMon} dex={dex} onChange={updateSelected} errors={selectedErrors} />
          ) : (
            <p className="text-footnote text-muted-foreground">Agrega un pokémon para editar su set.</p>
          )}
        </div>
      </div>

      {/* Escritorio: reglas siempre visibles. */}
      <div className="hidden sm:block">
        <ChecklistPanel rows={rows} empty={team.length === 0} />
      </div>

      {/* Móvil: barra inferior plegable. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card pb-safe sm:hidden">
        <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-subhead">
            <span>{passedCount} de {rows.length} reglas cumplidas</span>
            <ChevronUp className={cn("transition-transform", checklistOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="max-h-[50vh] overflow-y-auto px-4 pb-4">
            <ChecklistPanel rows={rows} empty={team.length === 0} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {error && <p role="alert" className="text-subhead text-destructive">{error}</p>}
      <Button size="lg" disabled={!teamOk || busy} onClick={() => void save()}>
        {busy ? <><Loader2 className="animate-spin" /> Guardando…</> : saveLabel}
      </Button>

      <SpeciesPicker
        dex={dex}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        team={combined}
        banned={banned}
        hint={hint}
        onPick={(sp) => {
          setTeam((cur) => [...cur, { species: sp.name, held_item: null, ability: null, nature: null, tera_type: null, moves: [], evs: {}, ivs: {} }]);
          setSelected(team.length);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
