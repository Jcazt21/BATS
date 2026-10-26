import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ChevronUp, Loader2, Plus, X } from "lucide-react";
import { MonCard } from "@/components/team/MonCard";
import { ChecklistPanel } from "@/components/team/ChecklistPanel";
import { RuleErrors } from "@/components/team/RuleErrors";
import { TypeCoveragePanel } from "@/components/team/TypeCoveragePanel";
import { PasteIO, type ImportMode } from "@/components/builder/PasteIO";
import { SetEditor } from "@/components/builder/SetEditor";
import { SpeciesPicker } from "@/components/builder/SpeciesPicker";
import { saveBlockers } from "@/lib/dex/blockers";
import { buildHints } from "@/lib/dex/hints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { DexEssentials } from "@/lib/dex/snapshot";
import { speciesById } from "@/lib/dex/snapshot";
import { useLearnset, useLearnsets } from "@/lib/dex/useLearnset";
import { checkSet, checkTeam, type BuilderMon, type RuleSeason } from "@/lib/dex/validate";
import { computeTypeCoverage } from "@/lib/dex/coverage";
import { teamErrorMessage } from "@/lib/dex/ruleMessages";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  dex: DexEssentials;
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
  /** Si se pasa, el equipo se autoguarda como borrador en localStorage bajo esta clave. */
  draftKey?: string;
  /** Avisa cuando el equipo difiere de `initial` (hay cambios sin guardar). */
  onDirtyChange?: (dirty: boolean) => void;
}

const DRAFT_DEBOUNCE_MS = 500;

interface TeamItem { uid: string; mon: BuilderMon }

function withUid(mon: BuilderMon): TeamItem {
  return { uid: crypto.randomUUID(), mon };
}

/**
 * Teambuilder completo: hasta `maxSize` pokémon (izquierda), el set del seleccionado
 * (derecha, SetEditor), reglas de la temporada en vivo (ChecklistPanel) y paste
 * import/export (PasteIO). `onSave` decide qué hace el llamador con el pool final
 * (registrar, agregar, reemplazar): TeamBuilder no conoce la API.
 */
export function TeamBuilder({ dex, initial, context = [], season, banned, maxSize, onSave, saveLabel = "Guardar", draftKey, onDirtyChange }: Props) {
  // Cada pokémon lleva un uid estable para que React no mezcle tarjetas al quitar o reordenar.
  // El borrador solo se restaura en un registro nuevo (`initial` vacío).
  const [restored] = useState(() => (draftKey && initial.length === 0 ? loadDraft(draftKey) : null));
  const [restoredAt, setRestoredAt] = useState<string | null>(restored?.savedAt ?? null);
  const [items, setItems] = useState<TeamItem[]>(() => (restored ? restored.team : initial).map(withUid));
  const team = useMemo(() => items.map((it) => it.mon), [items]);
  // Último equipo (JSON) que ya está reflejado en el borrador: evita reescribirlo sin cambios.
  const draftedRef = useRef(JSON.stringify(restored ? restored.team : initial));
  const dirty = JSON.stringify(team) !== JSON.stringify(initial);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!draftKey) return;
    const json = JSON.stringify(team);
    if (json === draftedRef.current) return;
    const timer = window.setTimeout(() => {
      saveDraft(draftKey, team);
      draftedRef.current = json;
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [team, draftKey]);
  const [selected, setSelected] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const combined = [...context, ...team];
  const { rows } = checkTeam(dex, combined, season, banned, false);
  const coverage = useMemo(() => computeTypeCoverage(dex, team), [dex, team]);
  const hints = buildHints(rows, season);

  const speciesIds = team.map((m) => speciesById(dex, m.species)?.id).filter((id): id is string => !!id);
  const learnsets = useLearnsets(speciesIds);
  // Problemas de cada set; una especie desconocida cuenta como 1 (no se puede validar).
  const setProblems = team.map((m) => {
    const id = speciesById(dex, m.species)?.id;
    return { name: m.species, count: id ? checkSet(dex, learnsets.map[id] ?? null, m).length : 1 };
  });
  // Con learnsets pendientes o fallidos no se puede dar el equipo por válido.
  // Con contexto (agregar/reemplazar) el servidor no corre check_team: solo rechaza baneados
  // entre los pokémon NUEVOS y el desborde de tamaño. Las demás reglas son solo informativas.
  const blockingRows = context.length === 0
    ? rows
    : [
      ...rows.filter((r) => r.rule === "team_size"),
      ...checkTeam(dex, team, season, banned, false).rows.filter((r) => r.rule === "banned"),
    ];
  const blockers = saveBlockers({
    team, rows: blockingRows, setErrors: setProblems, learnsetsPending: learnsets.pending, learnsetsError: !!learnsets.error,
  });
  const teamOk = blockers.length === 0;

  const selectedMon = team[selected] ?? null;
  const selectedSpecies = selectedMon ? speciesById(dex, selectedMon.species) : null;
  const { learnset: selectedLearnset } = useLearnset(selectedSpecies?.id ?? null);
  const selectedErrors = selectedMon ? checkSet(dex, selectedLearnset, selectedMon) : [];

  function updateSelected(mon: BuilderMon) {
    setItems((cur) => cur.map((it, i) => (i === selected ? { ...it, mon } : it)));
  }

  function removeAt(index: number) {
    setItems((cur) => cur.filter((_, i) => i !== index));
    setSelected((cur) => (cur >= index ? Math.max(0, cur - 1) : cur));
  }

  function importMons(mons: BuilderMon[], mode: ImportMode) {
    if (mode === "append") {
      setItems((cur) => [...cur, ...mons.map(withUid)]);
      return;
    }
    setItems(mons.map(withUid));
    setSelected(0);
  }

  function discardDraft() {
    if (draftKey) clearDraft(draftKey);
    draftedRef.current = "[]";
    setRestoredAt(null);
    setItems([]);
    setSelected(0);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(team);
      if (draftKey) {
        clearDraft(draftKey);
        draftedRef.current = JSON.stringify(team);
      }
    } catch (e) {
      setError(teamErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const passedCount = rows.filter((r) => r.ok).length;

  return (
    <div className="flex flex-col gap-6 pb-24 sm:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-3">
          {restoredAt && (
            <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-footnote">
              <span>Recuperamos tu borrador del {fmtDateShort(restoredAt)}</span>
              <Button type="button" variant="secondary" size="xs" onClick={discardDraft}>Descartar</Button>
            </div>
          )}
          <ul className="flex flex-col gap-2" aria-label="Pokémon del equipo">
            <AnimatePresence initial={false}>
            {items.map(({ uid, mon: m }, i) => {
              const sp = speciesById(dex, m.species);
              return (
                <MonCard
                  key={uid}
                  mon={{ name: sp?.name ?? m.species, types: sp?.types.join(" / "), held_item: m.held_item, ability: m.ability, moves: m.moves }}
                  banned={!!sp && banned.has(sp.name.toLowerCase())}
                  selected={i === selected}
                  onSelect={() => setSelected(i)}
                  badge={setProblems[i].count > 0 ? (
                    <Badge variant="destructive">{setProblems[i].count} {setProblems[i].count === 1 ? "problema" : "problemas"}</Badge>
                  ) : undefined}
                  actions={
                    <Button variant="ghost" size="xs" onClick={() => removeAt(i)}>
                      <X /> Quitar
                    </Button>
                  }
                />
              );
            })}
            </AnimatePresence>
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

      {/* Escritorio: reglas y cobertura siempre visibles. */}
      <div className="hidden flex-col gap-4 sm:flex">
        <ChecklistPanel rows={rows} empty={team.length === 0} />
        <TypeCoveragePanel rows={coverage} empty={team.length === 0} />
      </div>

      {/* Móvil: barra inferior plegable. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card pb-safe sm:hidden">
        <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-subhead">
            <span>{passedCount} de {rows.length} reglas cumplidas</span>
            <ChevronUp className={cn("transition-transform duration-200 ease-ios", checklistOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto px-4 pb-4">
            <ChecklistPanel rows={rows} empty={team.length === 0} />
            <TypeCoveragePanel rows={coverage} empty={team.length === 0} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {learnsets.error && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-footnote text-destructive">
          <span>No se pudieron cargar los movimientos para validar el equipo</span>
          <Button type="button" variant="secondary" size="xs" onClick={learnsets.retry}>
            Reintentar
          </Button>
        </div>
      )}
      {error && <RuleErrors errors={[error]} />}
      <Button size="lg" disabled={!teamOk || busy} onClick={() => void save()}>
        {busy ? <><Loader2 className="animate-spin" /> Guardando…</> : saveLabel}
      </Button>
      {!teamOk && (
        <ul data-testid="save-blockers" aria-label="Motivos por los que no se puede guardar" className="flex flex-col gap-1 text-footnote text-muted-foreground">
          {blockers.slice(0, 3).map((b) => <li key={b}>{b}</li>)}
          {blockers.length > 3 && <li>y {blockers.length - 3} más</li>}
        </ul>
      )}

      <SpeciesPicker
        dex={dex}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        team={combined}
        banned={banned}
        hints={hints}
        onPick={(sp) => {
          setItems((cur) => [...cur, withUid({ species: sp.name, held_item: null, ability: null, nature: null, tera_type: null, moves: [], evs: {}, ivs: {} })]);
          setSelected(team.length);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
