import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { BuilderMon } from "@/lib/dex/validate";
import type { DexEssentials, Species, SpeciesFilters, SpeciesSort } from "@/lib/dex/snapshot";
import type { SpeciesHint } from "@/lib/dex/hints";
import { searchSpecies, speciesById, toId } from "@/lib/dex/snapshot";
import { POKEMON_TYPES, typeLabel } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

interface Props {
  dex: DexEssentials;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (species: Species) => void;
  /** Equipo actual: las especies ya elegidas se deshabilitan (no se repiten especies). */
  team?: BuilderMon[];
  /** Nombres baneados, en minúsculas. */
  banned?: Set<string>;
  /** Una sugerencia por cada regla de conjunto que le falta al equipo (lib/dex/hints.ts). */
  hints?: SpeciesHint[];
  /** Filtros con los que arranca cada vez que se abre (p. ej. desde una regla que falta). */
  initialFilters?: SpeciesFilters;
  /**
   * "Agregar y seguir": elegir una especie la agrega y deja el buscador abierto; se cierra
   * solo al llenar el equipo (`progress.count + 1 >= progress.max`).
   */
  keepOpen?: boolean;
  /** Pokémon ya en el equipo / máximo, para el contador "N/6". */
  progress?: { count: number; max: number };
}

const PAGE_SIZE = 60;
/** Las especies ilegales no se pueden registrar: se ocultan salvo que el jugador lo pida. */
const DEFAULT_FILTERS: SpeciesFilters = { onlyLegal: true };

const SORT_OPTIONS: { value: SpeciesSort; label: string }[] = [
  { value: "num", label: "Nº" },
  { value: "name", label: "Nombre" },
  { value: "bst", label: "BST" },
  { value: "spe", label: "Veloc." },
];

/** Chip de filtro con hit-area de 44px (el área extra es invisible). */
function Chip({ pressed, onClick, className, children }: { pressed: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "relative rounded-full px-3 py-1 text-footnote outline-none transition-colors before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Buscador de especies dentro de un ResponsiveSheet: filtros en chips (tipo a la vista; generación,
 * color y egg group en "Más filtros"), orden, sprite, tipos, BST y distintivos. `hints` son atajos
 * de un toque para lo que le falta al equipo. Teclado: ↑/↓ recorre, Enter agrega, `/` busca.
 */
export function SpeciesPicker({
  dex, open, onOpenChange, onPick, team = [], banned = new Set(), hints = [], initialFilters, keepOpen, progress,
}: Props) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SpeciesFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SpeciesSort>("num");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [cursor, setCursor] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Al abrir, parte de los filtros pedidos por quien lo abre (o de los predeterminados).
  useEffect(() => {
    if (open) {
      setFilters({ ...DEFAULT_FILTERS, ...initialFilters });
      setLastAdded(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Valores reales del snapshot: así los chips nunca ofrecen algo que no exista.
  const options = useMemo(() => {
    const all = Object.values(dex.species);
    const uniq = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
    return {
      gens: [...new Set(all.map((sp) => sp.gen))].filter((g) => g > 0).sort((a, b) => a - b),
      colors: uniq(all.map((sp) => sp.color).filter(Boolean)),
      eggGroups: uniq(all.flatMap((sp) => sp.eggGroups)),
    };
  }, [dex]);

  const usedIds = useMemo(
    () => new Set(team.map((m) => speciesById(dex, m.species)?.id).filter((id): id is string => !!id)),
    [team, dex],
  );

  // La caja de texto responde al instante; la búsqueda sobre todo el dex va un paso detrás.
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(() => searchSpecies(dex, deferredQuery, filters, sort), [dex, deferredQuery, filters, sort]);
  const results = matches.slice(0, limit);
  const active = [
    filters.type && { key: "type" as const, label: `Tipo ${filters.type}` },
    filters.gen != null && { key: "gen" as const, label: `Gen ${filters.gen}` },
    filters.color && { key: "color" as const, label: `Color ${filters.color}` },
    filters.eggGroup && { key: "eggGroup" as const, label: `Egg Group ${filters.eggGroup}` },
  ].filter((a): a is { key: "type" | "gen" | "color" | "eggGroup"; label: string } => !!a);

  const isDisabled = (sp: Species) => usedIds.has(sp.id) || banned.has(sp.name.toLowerCase());

  // Cualquier cambio de búsqueda o filtros vuelve al principio de la lista.
  function change(update: () => void) {
    update();
    setLimit(PAGE_SIZE);
    setCursor(0);
  }

  const is = (a: string | undefined, b: string) => !!a && toId(a) === toId(b);
  const toggle = <K extends "type" | "gen" | "color" | "eggGroup">(key: K, value: SpeciesFilters[K], same: boolean) =>
    change(() => setFilters((f) => ({ ...f, [key]: same ? undefined : value })));

  function pick(sp: Species) {
    if (isDisabled(sp)) return;
    onPick(sp);
    if (!keepOpen) return;
    setLastAdded(sp.name);
    if (progress && progress.count + 1 >= progress.max) onOpenChange(false);
  }

  // `pick` cambia en cada render; las filas memoizadas reciben una versión estable.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const stablePick = useCallback((sp: Species) => pickRef.current(sp), []);

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(results.length - 1, c + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      pick(results[cursor]);
    }
  }

  function onRootKey(e: KeyboardEvent<HTMLDivElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Elegir especie"
      description="Busca por nombre o filtra por tipo, generación, color o egg group."
    >
      <div className="flex flex-col gap-3" onKeyDown={onRootKey}>
        {(keepOpen || progress) && (
          <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 text-footnote">
            <span className="flex items-center gap-1 text-success">
              {lastAdded && <><Check className="size-4" aria-hidden /> Agregado: {lastAdded}</>}
            </span>
            {progress && <span className="font-mono tabular-nums text-muted-foreground">{progress.count}/{progress.max}</span>}
          </div>
        )}

        <Input
          ref={searchRef}
          autoFocus
          placeholder="Buscar especie…  ( / )"
          aria-label="Buscar especie"
          value={query}
          onChange={(e) => change(() => setQuery(e.target.value))}
          onKeyDown={onSearchKey}
        />

        {hints.length > 0 && (
          <div role="group" aria-label="Lo que le falta al equipo" className="flex flex-col gap-1.5">
            {hints.map((h) => (
              <button
                key={h.label}
                type="button"
                // El atajo reemplaza los filtros de especie, pero respeta "solo legales".
                onClick={() => change(() => setFilters((f) => ({ ...h.filters, onlyLegal: f.onlyLegal })))}
                className="min-h-11 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-left text-footnote text-muted-foreground transition-colors hover:bg-muted"
              >
                {h.label}
              </button>
            ))}
          </div>
        )}

        {active.length > 0 && (
          <ul aria-label="Filtros activos" className="flex flex-wrap gap-1.5">
            {active.map((a) => (
              <li key={a.key}>
                <button
                  type="button"
                  aria-label={`Quitar filtro ${a.label}`}
                  onClick={() => change(() => setFilters((f) => ({ ...f, [a.key]: undefined })))}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary/10 px-3 text-footnote font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {a.label} <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div role="group" aria-label="Tipo" className="flex flex-wrap gap-1.5">
          {POKEMON_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={is(filters.type, t)}
              onClick={() => toggle("type", t, is(filters.type, t))}
              className={cn(
                `type-${t} relative rounded-full px-2.5 py-1 text-caption outline-none transition-opacity before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring`,
                !is(filters.type, t) && "opacity-40",
              )}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>

        <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
          <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between text-footnote font-medium text-muted-foreground">
            Más filtros
            <ChevronDown className={cn("size-4 transition-transform duration-200 ease-ios", moreOpen && "rotate-180")} aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-3 pb-1">
              <div role="group" aria-label="Generación" className="flex flex-wrap gap-1.5">
                {options.gens.map((g) => (
                  <Chip key={g} pressed={filters.gen === g} onClick={() => toggle("gen", g, filters.gen === g)}>Gen {g}</Chip>
                ))}
              </div>
              <div role="group" aria-label="Color" className="flex flex-wrap gap-1.5">
                {options.colors.map((c) => (
                  <Chip key={c} pressed={is(filters.color, c)} onClick={() => toggle("color", c, is(filters.color, c))}>{c}</Chip>
                ))}
              </div>
              <div role="group" aria-label="Egg group" className="flex flex-wrap gap-1.5">
                {options.eggGroups.map((g) => (
                  <Chip key={g} pressed={is(filters.eggGroup, g)} onClick={() => toggle("eggGroup", g, is(filters.eggGroup, g))}>{g}</Chip>
                ))}
              </div>
              <SegmentedControl label="Ordenar por" value={sort} onChange={(v) => change(() => setSort(v))} options={SORT_OPTIONS} />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={!!filters.onlyLegal}
            aria-label="Solo legales en la liga"
            onClick={() => change(() => setFilters((f) => ({ ...f, onlyLegal: f.onlyLegal ? undefined : true })))}
            className="group flex min-h-11 items-center gap-3 text-footnote text-muted-foreground outline-none"
          >
            <span className="relative h-6 w-10 rounded-full bg-muted transition-colors group-aria-checked:bg-primary group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-card shadow-sm transition-transform duration-200 ease-ios group-aria-checked:translate-x-4" />
            </span>
            Solo legales en la liga
          </button>
          {active.length > 0 && (
            <button
              type="button"
              onClick={() => change(() => setFilters((f) => ({ onlyLegal: f.onlyLegal })))}
              className="min-h-11 text-footnote text-primary underline-offset-2 hover:underline"
            >
              Limpiar filtros ({active.length})
            </button>
          )}
        </div>

        {matches.length > results.length && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption text-muted-foreground">Mostrando {results.length} de {matches.length}</p>
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="min-h-11 text-footnote font-medium text-primary"
            >
              Ver más
            </button>
          </div>
        )}

        <ul className="flex flex-col divide-y divide-border overflow-y-auto">
          {results.map((sp, i) => (
            <SpeciesRow
              key={sp.id}
              sp={sp}
              used={usedIds.has(sp.id)}
              banned={banned.has(sp.name.toLowerCase())}
              active={i === cursor}
              onPick={stablePick}
            />
          ))}
          {results.length === 0 && (
            <li className="px-1 py-6 text-center text-footnote text-muted-foreground">Sin resultados.</li>
          )}
        </ul>
      </div>
    </ResponsiveSheet>
  );
}

interface RowProps { sp: Species; used: boolean; banned: boolean; active: boolean; onPick: (sp: Species) => void }

/** Fila del buscador: memoizada, así teclear o mover el cursor no repinta cientos de filas. */
const SpeciesRow = memo(function SpeciesRow({ sp, used, banned, active, onPick }: RowProps) {
  return (
    // content-visibility: el navegador omite el layout/pintado de las filas fuera de pantalla.
    <li className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]">
      <button
        type="button"
        disabled={used || banned}
        data-active={active || undefined}
        onClick={() => onPick(sp)}
        className="flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[active]:bg-muted"
      >
        <PokemonSprite species={sp.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{sp.name}</span>
            {used && <Badge variant="secondary">En el equipo</Badge>}
            {sp.paradox && <Badge variant="warning">Paradox</Badge>}
            {sp.pseudo && <Badge variant="info">Pseudo</Badge>}
            {sp.restricted && <Badge variant="destructive">Restringido</Badge>}
            {sp.ultraBeast && <Badge variant="destructive">Ultra Beast</Badge>}
            {!sp.leagueLegal && <Badge variant="destructive">No legal</Badge>}
            {banned && <Badge variant="destructive">Baneado esta temporada</Badge>}
          </div>
          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            <TypeBadges types={sp.types.join(" / ")} />
            <span>BST {sp.bst}</span>
          </div>
        </div>
      </button>
    </li>
  );
});
