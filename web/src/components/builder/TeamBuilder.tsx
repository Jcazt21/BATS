import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { SlotBoard, type Slot } from "@/components/team/SlotBoard";
import { RulesBar } from "@/components/team/RulesBar";
import { RuleErrors } from "@/components/team/RuleErrors";
import { TypeCoveragePanel, coverageSummary } from "@/components/team/TypeCoveragePanel";
import { PasteIO, type ImportMode } from "@/components/builder/PasteIO";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { SetEditor } from "@/components/builder/SetEditor";
import { SpeciesPicker } from "@/components/builder/SpeciesPicker";
import { saveBlockers } from "@/lib/dex/blockers";
import { slotStatus } from "@/lib/dex/slotStatus";
import { buildHints } from "@/lib/dex/hints";
import { Button } from "@/components/ui/button";
import type { DexEssentials, SpeciesFilters } from "@/lib/dex/snapshot";
import { speciesById } from "@/lib/dex/snapshot";
import { useLearnset, useLearnsets } from "@/lib/dex/useLearnset";
import { checkSetProblems, checkTeam, type BuilderMon, type RuleSeason } from "@/lib/dex/validate";
import { computeTypeCoverage } from "@/lib/dex/coverage";
import { teamErrorMessage } from "@/lib/dex/ruleMessages";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { toPaste } from "@/lib/showdown";
import { useToast } from "@/lib/toast";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { fmtDateShort } from "@/lib/format";

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
  /** Dentro de una hoja (agregar/reemplazar): la barra de reglas va en línea, no fija. */
  inline?: boolean;
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
export function TeamBuilder({ dex, initial, context = [], season, banned, maxSize, onSave, saveLabel = "Guardar", draftKey, onDirtyChange, inline }: Props) {
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
  // Destino del buscador: agregar al final o cambiar la especie de un slot.
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [pickerFilters, setPickerFilters] = useState<SpeciesFilters | undefined>(undefined);
  const { toast } = useToast();
  const wide = useMediaQuery("(min-width: 768px)");
  // En móvil el editor vive en una hoja que se abre al tocar un slot.
  const [editorOpen, setEditorOpen] = useState(false);
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
    const problems = checkSetProblems(dex, id ? learnsets.map[id] ?? null : null, m);
    return { name: m.species, count: id ? problems.length : 1, problems };
  });
  const slots: Slot[] = items.map(({ uid, mon: m }, i) => {
    const sp = speciesById(dex, m.species);
    return {
      uid,
      name: sp?.name ?? m.species,
      types: sp?.types.join(" / "),
      banned: !!sp && banned.has(sp.name.toLowerCase()),
      status: slotStatus(m, setProblems[i].problems, learnsets.pending),
      hasContent: !!(m.held_item || m.ability || m.moves.length),
    };
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
  const selectedProblems = selectedMon ? checkSetProblems(dex, selectedLearnset, selectedMon) : [];

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

  function openPicker(filters?: SpeciesFilters, swap: number | null = null) {
    setPickerFilters(filters);
    setSwapIndex(swap);
    setPickerOpen(true);
  }

  function moveSlot(index: number, delta: -1 | 1) {
    const target = index + delta;
    setItems((cur) => {
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelected((cur) => (cur === index ? target : cur === target ? index : cur));
  }

  async function copySet(index: number) {
    const m = team[index];
    const text = toPaste({
      name: speciesById(dex, m.species)?.name ?? m.species,
      held_item: m.held_item, ability: m.ability, nature: m.nature, tera_type: m.tera_type,
      evs: m.evs, ivs: m.ivs, moves: m.moves,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado", description: `${m.species} está en el portapapeles en formato Showdown.`, tone: "success" });
    } catch {
      toast({ title: "No se pudo copiar", tone: "error" });
    }
  }

  const editor = selectedMon ? (
    <SetEditor mon={selectedMon} dex={dex} onChange={updateSelected} problems={selectedProblems} />
  ) : (
    <p className="text-footnote text-muted-foreground">Agrega un pokémon para editar su set.</p>
  );

  return (
    <div className="flex flex-col gap-6 pb-32 md:pb-0">
      <div className={cn(inline ? "" : "sticky top-14 z-30 -mx-4 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6", "md:py-2")}>
        <RulesBar
          rows={rows}
          season={season}
          empty={team.length === 0}
          onAction={openPicker}
          summary={coverageSummary(coverage)}
          inline={inline}
          sheetExtra={<div className="mt-4 md:hidden"><TypeCoveragePanel rows={coverage} empty={team.length === 0} /></div>}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-3">
          {restoredAt && (
            <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-footnote">
              <span>Recuperamos tu borrador del {fmtDateShort(restoredAt)}</span>
              <Button type="button" variant="secondary" size="xs" onClick={discardDraft}>Descartar</Button>
            </div>
          )}
          <SlotBoard
            slots={slots}
            maxSize={maxSize}
            selected={selected}
            onSelect={setSelected}
            onOpen={() => { if (!wide) setEditorOpen(true); }}
            onAdd={() => openPicker()}
            onRemove={removeAt}
            onSwap={(i) => openPicker(undefined, i)}
            onCopy={(i) => void copySet(i)}
            onMove={moveSlot}
          />

          {/* Escritorio: la cobertura queda bajo los slots; en móvil va dentro de la hoja de reglas. */}
          <div className="hidden md:block">
            <TypeCoveragePanel rows={coverage} empty={team.length === 0} />
          </div>

          <PasteIO dex={dex} team={team} maxSize={maxSize} onImport={importMons} />
        </div>

        {wide && <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">{editor}</div>}
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

      {!wide && (
        <ResponsiveSheet
          open={editorOpen && !!selectedMon}
          onOpenChange={setEditorOpen}
          title={selectedMon ? speciesById(dex, selectedMon.species)?.name ?? selectedMon.species : "Set"}
          description="Edita el set de este pokémon."
        >
          {editor}
        </ResponsiveSheet>
      )}

      <SpeciesPicker
        dex={dex}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        team={combined}
        banned={banned}
        hints={hints}
        initialFilters={pickerFilters}
        keepOpen={swapIndex === null}
        progress={{ count: team.length, max: maxSize }}
        onPick={(sp) => {
          const fresh: BuilderMon = { species: sp.name, held_item: null, ability: null, nature: null, tera_type: null, moves: [], evs: {}, ivs: {} };
          if (swapIndex !== null) {
            setItems((cur) => cur.map((it, i) => (i === swapIndex ? { ...it, mon: fresh } : it)));
            setSelected(swapIndex);
          } else {
            setItems((cur) => [...cur, withUid(fresh)]);
            setSelected(team.length);
            return; // "agregar y seguir": el buscador se cierra solo al llenar el equipo
          }
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
