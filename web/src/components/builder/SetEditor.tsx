import { useMemo, type ReactNode } from "react";
import { EVEditor } from "@/components/builder/EVEditor";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/app/States";
import { useLearnset } from "@/lib/dex/useLearnset";
import { useDexDetails } from "@/lib/queries";
import type { DexEssentials } from "@/lib/dex/snapshot";
import { speciesById, toId } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";
import { POKEMON_TYPES, typeLabel, type PokemonType } from "@/lib/pokemon-types";

interface Props {
  mon: BuilderMon;
  dex: DexEssentials;
  onChange: (mon: BuilderMon) => void;
  errors?: string[];
}

const MOVE_SLOTS = [0, 1, 2, 3];
const STAT_IDS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const STAT_LABELS: Record<string, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
/** Resumen de stats a nivel 100 (estándar competitivo): BuilderMon no guarda nivel. */
const SUMMARY_LEVEL = 100;

function normalizeSpread(rec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) out[toId(k)] = v;
  return out;
}

/** Fórmula estándar de stats (sin IVs perfectos garantizados: usa lo que haya en el set). */
function computeStat(base: number, ev: number, iv: number, isHp: boolean, natureMult: number): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * SUMMARY_LEVEL) / 100);
  if (isHp) return base <= 1 ? base : core + SUMMARY_LEVEL + 10;
  return Math.floor((core + 5) * natureMult);
}

const CATEGORY_LABELS: Record<string, string> = { Physical: "Físico", Special: "Especial", Status: "Estado" };

/** "Físico · 100 · 100% · STAB": lo que hace falta para elegir sin abrir la Pokédex. */
function moveSublabel(mv: { category: string; basePower: number; accuracy: number | boolean }, stab: boolean): string {
  const parts = [CATEGORY_LABELS[mv.category] ?? mv.category];
  if (mv.category !== "Status") parts.push(String(mv.basePower));
  parts.push(mv.accuracy === true ? "—" : `${mv.accuracy}%`);
  if (stab) parts.push("STAB");
  return parts.join(" · ");
}

/** "fire" -> "Fire": el dato real (tera_type, tipos) va siempre en inglés; typeLabel es solo UI. */
function typeName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Editor de un set: objeto, habilidad (solo las de la especie), naturaleza, tera type,
 * cuatro movimientos restringidos al learnset de la especie, y EVs/IVs (EVEditor).
 * Cada error de `errors` (viene de checkSet, Task 11) se pinta junto al campo que lo causa.
 */
export function SetEditor({ mon, dex, onChange, errors = [] }: Props) {
  const species = speciesById(dex, mon.species);
  const learnset = useLearnset(species?.id ?? null);
  const details = useDexDetails();

  const itemItems: ComboboxItem[] = useMemo(
    () => Object.values(dex.items).map((it) => ({ id: it.id, label: it.name })),
    [dex],
  );
  const natureItems: ComboboxItem[] = useMemo(
    () => Object.values(details.data?.natures ?? {}).map((n) => ({
      id: toId(n.name), label: n.name, sublabel: n.plus && n.minus ? `+${n.plus} / −${n.minus}` : "Neutra",
    })),
    [details.data],
  );
  const moveItems: ComboboxItem[] = useMemo(() => {
    const speciesTypes = new Set((species?.types ?? []).map(toId));
    return learnset
      .map((id) => details.data?.moves[id])
      .filter((mv): mv is NonNullable<typeof mv> => !!mv)
      .map((mv) => {
        const type = toId(mv.type) as PokemonType;
        const stab = mv.category !== "Status" && speciesTypes.has(type);
        return {
          id: mv.id, label: mv.name,
          sublabel: moveSublabel(mv, stab),
          // Buscar "fuego", "fire", "estado" o "flinch" también filtra.
          keywords: `${mv.type} ${typeLabel(type)} ${CATEGORY_LABELS[mv.category] ?? ""} ${mv.shortDesc}`,
          icon: <span className={`type-${type} shrink-0 rounded-full px-1.5 py-0.5 text-caption`}>{typeLabel(type)}</span>,
        };
      });
  }, [learnset, details.data, species]);
  const abilityItems: ComboboxItem[] = useMemo(
    () => (species?.abilities ?? []).map((a) => ({ id: toId(a), label: a })),
    [species],
  );

  if (!species) {
    return <p className="text-footnote text-muted-foreground">Elige una especie para editar su set.</p>;
  }
  if (details.isPending) {
    return <div className="flex flex-col gap-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-32" /></div>;
  }
  if (details.isError) {
    return <ErrorState error={details.error} onRetry={() => details.refetch()} />;
  }
  const dexDetails = details.data;

  function patch(next: Partial<BuilderMon>) {
    onChange({ ...mon, ...next });
  }

  function setMove(index: number, moveId: string) {
    const move = dexDetails.moves[moveId];
    if (!move) return;
    const moves = [...mon.moves];
    // Elegir en un slot más allá de los ocupados lo agrega al final: sin huecos en el array.
    if (index < moves.length) moves[index] = move.name;
    else moves.push(move.name);
    onChange({ ...mon, moves });
  }

  function clearMove(index: number) {
    onChange({ ...mon, moves: mon.moves.filter((_, i) => i !== index) });
  }

  const chosenMoveIds = mon.moves.map(toId);

  const nature = mon.nature ? dexDetails.natures[toId(mon.nature)] : null;
  const evs = normalizeSpread(mon.evs);
  const ivs = normalizeSpread(mon.ivs);
  const stats = STAT_IDS.map((id) => {
    const mult = nature ? (nature.plus === id ? 1.1 : nature.minus === id ? 0.9 : 1) : 1;
    const value = computeStat(species.baseStats[id] ?? 0, evs[id] ?? 0, ivs[id] ?? 31, id === "hp", mult);
    return { id, label: STAT_LABELS[id], value };
  });

  const pick = (pattern: RegExp) => errors.filter((e) => pattern.test(e));
  const moveErrors = pick(/no aprende|repetido|4 movimientos/i);
  const abilityErrors = pick(/habilidad/i);
  const itemErrors = pick(/objeto válido/i);
  const evIvErrors = pick(/\bEVs\b|\bIVs\b/);
  const placed = new Set([...moveErrors, ...abilityErrors, ...itemErrors, ...evIvErrors]);
  const otherErrors = errors.filter((e) => !placed.has(e));

  return (
    <div className="flex flex-col gap-4">
      {otherErrors.length > 0 && <ErrorList items={otherErrors} />}

      <Field label="Objeto">
        <Combobox
          items={itemItems}
          value={mon.held_item ? toId(mon.held_item) : null}
          onChange={(id) => patch({ held_item: dex.items[id]?.name ?? null })}
          onClear={() => patch({ held_item: null })}
          clearLabel="Quitar objeto"
          placeholder="Sin objeto"
        />
        <ErrorList items={itemErrors} />
      </Field>

      <Field label="Habilidad">
        <Combobox
          items={abilityItems}
          value={mon.ability ? toId(mon.ability) : null}
          onChange={(id) => patch({ ability: abilityItems.find((a) => a.id === id)?.label ?? null })}
          onClear={() => patch({ ability: null })}
          clearLabel="Quitar habilidad"
          placeholder="Elegir habilidad"
        />
        <ErrorList items={abilityErrors} />
      </Field>

      <Field label="Naturaleza">
        <Combobox
          items={natureItems}
          value={mon.nature ? toId(mon.nature) : null}
          onChange={(id) => patch({ nature: natureItems.find((n) => n.id === id)?.label ?? null })}
          onClear={() => patch({ nature: null })}
          clearLabel="Quitar naturaleza"
          placeholder="Elegir naturaleza"
        />
      </Field>

      <Field label="Tera Type">
        <select
          value={mon.tera_type ? toId(mon.tera_type) : ""}
          onChange={(e) => patch({ tera_type: e.target.value ? typeName(e.target.value) : null })}
          className="h-10 w-full rounded-xl border border-input bg-card px-3 text-body"
        >
          <option value="">{species.types[0]} (tipo primario)</option>
          {POKEMON_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Movimientos">
        <div className="flex flex-col gap-2">
          {MOVE_SLOTS.map((i) => {
            const current = mon.moves[i] ? toId(mon.moves[i]) : null;
            const desc = current ? dexDetails.moves[current]?.shortDesc : null;
            // Un movimiento ya elegido en otro slot no se ofrece aquí.
            const items = moveItems.filter((it) => it.id === current || !chosenMoveIds.includes(it.id));
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <Combobox
                  items={items}
                  value={current}
                  onChange={(id) => setMove(i, id)}
                  onClear={() => clearMove(i)}
                  clearLabel={`Quitar movimiento ${i + 1}`}
                  placeholder={`Movimiento ${i + 1}`}
                  emptyText="Sin movimientos legales que coincidan"
                />
                {desc && <p className="px-1 text-caption text-muted-foreground">{desc}</p>}
              </div>
            );
          })}
        </div>
        <ErrorList items={moveErrors} />
      </Field>

      <div aria-label="Resumen de stats" className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-caption sm:grid-cols-6">
        {stats.map((s) => (
          <div key={s.id} className="flex flex-col items-center">
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium text-foreground">{s.value}</span>
          </div>
        ))}
      </div>

      <EVEditor evs={mon.evs} ivs={mon.ivs} onChange={({ evs, ivs }) => patch({ evs, ivs })} />
      <ErrorList items={evIvErrors} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-footnote">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function ErrorList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-caption text-destructive">
      {items.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}
