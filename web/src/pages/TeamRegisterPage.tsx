import { useState, useEffect } from "react";
import {
  Swords, ChevronRight, RefreshCw, ArrowLeft,
  Search, X, CheckCircle2, Info, Trash2, Upload,
  Plus, Edit3, ArrowLeftRight,
} from "lucide-react";

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input }     from "@/components/ui/input";
import { Button }    from "@/components/ui/button";
import { Badge }     from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  getActiveSeason, getRoster, registerTeam, removePokemonFromRoster,
  addPokemonToRoster, getPlayerBans,
  type ActiveSeasonInfo, type RosterInfo, type RosterPokemon,
} from "@/lib/api";
import { loadAllPokemon, searchPokemon, getPokemonDetail } from "@/lib/pokeapi";

// ── Type colours ──────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  Normal:   "bg-zinc-700/60   text-zinc-200",
  Fire:     "bg-orange-900/60 text-orange-300",
  Water:    "bg-blue-900/60   text-blue-300",
  Electric: "bg-yellow-800/60 text-yellow-300",
  Grass:    "bg-green-900/60  text-green-300",
  Ice:      "bg-cyan-900/60   text-cyan-300",
  Fighting: "bg-red-900/60    text-red-300",
  Poison:   "bg-purple-900/60 text-purple-300",
  Ground:   "bg-amber-900/60  text-amber-300",
  Flying:   "bg-indigo-900/60 text-indigo-300",
  Psychic:  "bg-pink-900/60   text-pink-300",
  Bug:      "bg-lime-900/60   text-lime-300",
  Rock:     "bg-stone-700/60  text-stone-300",
  Ghost:    "bg-violet-900/60 text-violet-300",
  Dragon:   "bg-indigo-800/60 text-indigo-200",
  Dark:     "bg-zinc-800/60   text-zinc-300",
  Steel:    "bg-slate-700/60  text-slate-300",
  Fairy:    "bg-rose-900/60   text-rose-300",
};

// ── Showdown parser ───────────────────────────────────────────────────────────
export interface ShowdownPokemon {
  species:   string;
  nickname?: string;
  held_item?: string;
  ability?:  string;
  nature?:   string;
  tera_type?: string;
  moves:     string[];
  evs:       Record<string, number>;
  ivs:       Record<string, number>;
  // resolved after PokeAPI lookup
  national_dex?: number;
  types?:        string;
  sprite_url?:   string;
  color?:        string;
  generation?:   number;
  egg_groups?:   string[];
}

function parseShowdownBlock(block: string): ShowdownPokemon | null {
  const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // Line 0: "[Nickname (Species)] @ Item"  OR  "[Species] @ Item"  OR  "[Species]"
  const [namePart, itemPart] = lines[0].split(" @ ");
  const held_item = itemPart?.trim();

  const parenMatch = namePart.trim().match(/^(.+?)\s*\((.+?)\)$/);
  const species  = parenMatch ? parenMatch[2].trim() : namePart.trim();
  const nickname = parenMatch ? parenMatch[1].trim() : undefined;

  const result: ShowdownPokemon = { species, nickname, held_item, moves: [], evs: {}, ivs: {} };

  for (const line of lines.slice(1)) {
    if (line.startsWith("- ")) {
      result.moves.push(line.slice(2).trim());
    } else if (line.startsWith("Ability: ")) {
      result.ability = line.slice(9).trim();
    } else if (line.startsWith("Tera Type: ")) {
      result.tera_type = line.slice(11).trim();
    } else if (line.startsWith("EVs: ")) {
      for (const part of line.slice(5).split(" / ")) {
        const [val, stat] = part.trim().split(" ");
        if (stat && val) result.evs[stat] = parseInt(val);
      }
    } else if (line.startsWith("IVs: ")) {
      for (const part of line.slice(5).split(" / ")) {
        const [val, stat] = part.trim().split(" ");
        if (stat && val) result.ivs[stat] = parseInt(val);
      }
    } else if (line.endsWith(" Nature")) {
      result.nature = line.slice(0, -7).trim();
    }
  }

  return result;
}

function parseShowdownPaste(paste: string): ShowdownPokemon[] {
  return paste
    .trim()
    .split(/\n\s*\n/)
    .map(parseShowdownBlock)
    .filter((p): p is ShowdownPokemon => p !== null && p.species.length > 0);
}

// ── Showdown pokemon card (preview / roster) ──────────────────────────────────
function PokemonCard({
  p, onRemove, onDelete, onSwap, banned = false, inLineup = false,
}: {
  p:         ShowdownPokemon | RosterPokemon;
  onRemove?: () => void;
  onDelete?: () => void;
  onSwap?:   () => void;
  banned?:   boolean;
  inLineup?: boolean;
}) {
  // Normalise to a common shape
  const isRoster = "pokemon_id" in p;
  const name      = isRoster ? (p as RosterPokemon).name       : (p as ShowdownPokemon).species;
  const sprite    = isRoster ? (p as RosterPokemon).sprite_url : (p as ShowdownPokemon).sprite_url;
  const types     = isRoster ? (p as RosterPokemon).types      : (p as ShowdownPokemon).types;
  const item      = isRoster ? (p as RosterPokemon).held_item  : (p as ShowdownPokemon).held_item;
  const ability   = isRoster ? (p as RosterPokemon).ability    : (p as ShowdownPokemon).ability;
  const nature    = isRoster ? (p as RosterPokemon).nature     : (p as ShowdownPokemon).nature;
  const tera      = isRoster ? (p as RosterPokemon).tera_type  : (p as ShowdownPokemon).tera_type;
  const moves     = isRoster ? (p as RosterPokemon).moves      : (p as ShowdownPokemon).moves;

  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border bg-muted/20 overflow-hidden ${inLineup ? "border-primary/50" : "border-border"}`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        {sprite
          ? <img src={sprite} alt={name} className="w-10 h-10 object-contain shrink-0" loading="lazy" />
          : <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">?</div>
        }
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold capitalize truncate">{name}</span>
            {banned   && <Badge variant="destructive" className="text-[9px] px-1 py-0 shrink-0">Baneado</Badge>}
            {inLineup && <Badge variant="outline"     className="text-[9px] px-1 py-0 shrink-0 border-primary/50 text-primary">Activo</Badge>}
          </div>
          {item && <span className="text-[10px] text-muted-foreground truncate">{item}</span>}
          <div className="flex gap-1 flex-wrap mt-0.5">
            {types?.split(" / ").map((t) => (
              <Badge key={t} variant="secondary" className={`text-[9px] px-1 py-0 ${TYPE_COLORS[t] ?? ""}`}>{t}</Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            title="Detalles"
          >
            <Info className="size-3.5" />
          </button>
          {onRemove && <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors p-0.5" title="Quitar"><X className="size-3.5" /></button>}
          {onDelete && <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors p-0.5" title="Eliminar del equipo"><Trash2 className="size-3.5" /></button>}
          {onSwap && <button onClick={onSwap} className="text-muted-foreground hover:text-primary transition-colors p-0.5" title="Cambiar pokémon"><ArrowLeftRight className="size-3.5" /></button>}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 flex flex-col gap-1.5 text-[10px] text-muted-foreground">
          {ability  && <span><span className="text-foreground/70">Ability:</span> {ability}</span>}
          {nature   && <span><span className="text-foreground/70">Nature:</span> {nature}</span>}
          {tera     && <span><span className="text-foreground/70">Tera:</span> {tera}</span>}
          {moves && moves.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-foreground/70">Moves:</span>
              {moves.map((m, i) => <span key={i} className="pl-2">— {m}</span>)}
            </div>
          )}
          {p && "evs" in p && Object.keys(p.evs).length > 0 && (
            <span>
              <span className="text-foreground/70">EVs:</span>{" "}
              {Object.entries(p.evs).map(([k, v]) => `${v} ${k}`).join(" / ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Step = "username" | "import" | "add" | "view" | "success";

export function TeamRegisterPage() {
  const [season,   setSeason]   = useState<ActiveSeasonInfo | null>(null);
  const [step,     setStep]     = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [roster,   setRoster]   = useState<RosterInfo | null>(null);

  // Username step
  const [checking,   setChecking]   = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Import step
  const [paste,            setPaste]            = useState("");
  const [parsed,           setParsed]           = useState<ShowdownPokemon[]>([]);
  const [bannedNames,      setBannedNames]      = useState<Set<string>>(new Set());
  const [restrictionViolations, setRestrictionViolations] = useState<{ key: string; label: string; names: string[] }[]>([]);
  const [parseError,       setParseError]       = useState<string | null>(null);
  const [resolving,        setResolving]        = useState(false);
  const [submitting,       setSubmitting]       = useState(false);
  const [submitError,      setSubmitError]      = useState<string | null>(null);

  // Delete dialog
  const [deleteTarget,  setDeleteTarget]  = useState<RosterPokemon | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);

  // Add step (adding to existing incomplete team)
  const [addPaste,       setAddPaste]       = useState("");
  const [addParsed,      setAddParsed]      = useState<ShowdownPokemon[]>([]);
  const [addBanned,      setAddBanned]      = useState<Set<string>>(new Set());
  const [addParseError,  setAddParseError]  = useState<string | null>(null);
  const [addResolving,   setAddResolving]   = useState(false);
  const [addSubmitting,  setAddSubmitting]  = useState(false);
  const [addSubmitError, setAddSubmitError] = useState<string | null>(null);

  // Swap mode (replacing a pokémon in a full team)
  const [swapMode,       setSwapMode]       = useState(false);
  const [swapTarget,     setSwapTarget]     = useState<RosterPokemon | null>(null);
  const [swapPaste,      setSwapPaste]      = useState("");
  const [swapParsed,     setSwapParsed]     = useState<ShowdownPokemon | null>(null);
  const [swapResolving,  setSwapResolving]  = useState(false);
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapError,      setSwapError]      = useState<string | null>(null);

  useEffect(() => {
    void loadAllPokemon();
    getActiveSeason().catch(() => null).then((s) => setSeason(s));
  }, []);

  // ── Username ───────────────────────────────────────────────────────────────
  async function handleCheckUsername() {
    const u = username.trim().toLowerCase();
    if (!u) return;
    setChecking(true);
    setCheckError(null);
    try {
      const existing = await getRoster(u).catch((e: Error) => {
        if (e.message === "not_found") return null;
        throw e;
      });
      if (existing) {
        setRoster(existing);
        setStep("view");
      } else {
        setStep("import");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "not_in_whitelist") {
        setCheckError("Este usuario no está registrado para participar en la temporada actual. Contacta al administrador.");
      } else {
        setCheckError(e instanceof Error ? e.message : "Error al verificar usuario");
      }
    } finally {
      setChecking(false);
    }
  }

  // ── Parse & resolve paste ─────────────────────────────────────────────────
  async function handleParsePaste() {
    const blocks = parseShowdownPaste(paste);
    if (blocks.length === 0) {
      setParseError("No se encontraron pokémon. Pega el equipo en formato Showdown.");
      setParsed([]);
      return;
    }
    if (season && blocks.length > season.max_team_size) {
      setParseError(`Máximo ${season.max_team_size} pokémon. Tu paste tiene ${blocks.length}.`);
      setParsed([]);
      return;
    }

    setResolving(true);
    setParseError(null);

    // Load player bans and pokémon resolution in parallel
    const [bansResult, ...resolveResults] = await Promise.allSettled([
      getPlayerBans(username.trim().toLowerCase()),
      ...blocks.map(async (mon) => {
        let match = searchPokemon(mon.species, 1)[0];
        if (!match) match = searchPokemon(mon.species.replace(/-\w+$/, ""), 1)[0];
        return { mon, match: match ? await getPokemonDetail(match.id) : null };
      }),
    ]);

    const bans = bansResult.status === "fulfilled"
      ? new Set((bansResult.value as Awaited<ReturnType<typeof getPlayerBans>>).map((b) => b.name.toLowerCase()))
      : new Set<string>();
    setBannedNames(bans);

    const notFound: string[] = [];
    const resolved: ShowdownPokemon[] = [];

    for (const r of resolveResults) {
      if (r.status !== "fulfilled") continue;
      const { mon, match } = r.value as { mon: ShowdownPokemon; match: import("@/lib/pokeapi").PokeResult | null };
      if (match) {
        resolved.push({
          ...mon,
          national_dex: match.id,
          types:        match.types,
          sprite_url:   match.sprite,
          color:        match.color,
          generation:   match.generation,
          egg_groups:   match.egg_groups,
        });
      } else {
        notFound.push(mon.species);
      }
    }

    if (notFound.length > 0) {
      setParseError(`No se encontraron en PokeAPI: ${notFound.join(", ")}. Verifica los nombres.`);
    }
    setParsed(resolved);
    setRestrictionViolations(computeRestrictionViolations(resolved, season));
    setResolving(false);
  }

  function computeRestrictionViolations(
    mons:   ShowdownPokemon[],
    s:      typeof season,
  ): { key: string; label: string; names: string[] }[] {
    if (!s) return [];
    const rules = s.restrictions ?? {};
    const violations: { key: string; label: string; names: string[] }[] = [];

    const reqColor = rules.required_color;
    if (reqColor) {
      const hasOne = mons.some((p) => p.color === reqColor);
      if (!hasOne) violations.push({ key: "required_color", label: `Color requerido: ${reqColor}`, names: ["ninguno"] });
    }

    const reqGen = rules.required_generation;
    if (reqGen) {
      const hasOne = mons.some((p) => p.generation === reqGen);
      if (!hasOne) violations.push({ key: "required_generation", label: `Generación requerida: Gen ${reqGen}`, names: ["ninguno"] });
    }

    const reqEgg = rules.required_egg_group;
    if (reqEgg) {
      const hasOne = mons.some((p) => p.egg_groups?.includes(reqEgg));
      if (!hasOne) violations.push({ key: "required_egg_group", label: `Egg Group requerido: ${reqEgg}`, names: ["ninguno"] });
    }

    if (rules.item_clause) {
      const items = mons.map((p) => p.held_item).filter(Boolean) as string[];
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const item of items) { if (seen.has(item)) dupes.add(item); else seen.add(item); }
      if (dupes.size) {
        const offenders = mons.filter((p) => p.held_item && dupes.has(p.held_item)).map((p) => p.species);
        violations.push({ key: "item_clause", label: "Item Clause", names: offenders });
      }
    }

    return violations;
  }

  // ── Register ───────────────────────────────────────────────────────────────
  async function handleRegister() {
    if (!parsed.length) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await registerTeam(
        username.trim().toLowerCase(),
        parsed.map((p) => ({
          name:         p.species,
          national_dex: p.national_dex ?? null,
          types:        p.types        ?? null,
          sprite_url:   p.sprite_url   ?? null,
          held_item:    p.held_item    ?? null,
          ability:      p.ability      ?? null,
          nature:       p.nature       ?? null,
          tera_type:    p.tera_type    ?? null,
          moves:        p.moves,
          evs:          p.evs,
          ivs:          p.ivs,
          color:        p.color        ?? null,
          generation:   p.generation   ?? null,
          egg_groups:   p.egg_groups   ?? [],
        })),
      );
      const r = await getRoster(username.trim().toLowerCase()).catch(() => null);
      setRoster(r);
      setStep("success");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Error al registrar equipo");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removePokemonFromRoster(username.trim().toLowerCase(), deleteTarget.pokemon_id);
      const updated = await getRoster(username.trim().toLowerCase()).catch(() => null);
      setRoster(updated);
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Error al eliminar pokémon");
    } finally {
      setDeleting(false);
    }
  }

  // ── Add to existing roster ─────────────────────────────────────────────────
  async function handleAddVerify() {
    const blocks = parseShowdownPaste(addPaste);
    if (blocks.length === 0) {
      setAddParseError("No se encontraron pokémon. Pega el equipo en formato Showdown.");
      setAddParsed([]);
      return;
    }
    const remaining = (season?.max_team_size ?? 8) - (roster?.pool.length ?? 0);
    if (blocks.length > remaining) {
      setAddParseError(`Solo puedes agregar ${remaining} pokémon más. Tu paste tiene ${blocks.length}.`);
      setAddParsed([]);
      return;
    }

    setAddResolving(true);
    setAddParseError(null);

    const [bansResult, ...resolveResults] = await Promise.allSettled([
      getPlayerBans(username.trim().toLowerCase()),
      ...blocks.map(async (mon) => {
        let match = searchPokemon(mon.species, 1)[0];
        if (!match) match = searchPokemon(mon.species.replace(/-\w+$/, ""), 1)[0];
        return { mon, match: match ? await getPokemonDetail(match.id) : null };
      }),
    ]);

    const bans = bansResult.status === "fulfilled"
      ? new Set((bansResult.value as Awaited<ReturnType<typeof getPlayerBans>>).map((b) => b.name.toLowerCase()))
      : new Set<string>();
    setAddBanned(bans);

    const notFound: string[] = [];
    const resolved: ShowdownPokemon[] = [];

    for (const r of resolveResults) {
      if (r.status !== "fulfilled") continue;
      const { mon, match } = r.value as { mon: ShowdownPokemon; match: import("@/lib/pokeapi").PokeResult | null };
      if (match) {
        resolved.push({ ...mon, national_dex: match.id, types: match.types, sprite_url: match.sprite, color: match.color, generation: match.generation, egg_groups: match.egg_groups });
      } else {
        notFound.push(mon.species);
      }
    }

    if (notFound.length > 0) setAddParseError(`No se encontraron: ${notFound.join(", ")}.`);
    setAddParsed(resolved);
    setAddResolving(false);
  }

  async function handleAddSubmit() {
    if (!addParsed.length) return;
    setAddSubmitting(true);
    setAddSubmitError(null);
    try {
      await addPokemonToRoster(
        username.trim().toLowerCase(),
        addParsed.map((p) => ({
          name:         p.species,
          national_dex: p.national_dex ?? null,
          types:        p.types        ?? null,
          sprite_url:   p.sprite_url   ?? null,
          held_item:    p.held_item    ?? null,
          ability:      p.ability      ?? null,
          nature:       p.nature       ?? null,
          tera_type:    p.tera_type    ?? null,
          moves:        p.moves,
          evs:          p.evs,
          ivs:          p.ivs,
          color:        p.color        ?? null,
          generation:   p.generation   ?? null,
          egg_groups:   p.egg_groups   ?? [],
        })),
      );
      const updated = await getRoster(username.trim().toLowerCase()).catch(() => null);
      setRoster(updated);
      setAddPaste(""); setAddParsed([]); setAddBanned(new Set()); setAddParseError(null);
      setStep("view");
    } catch (e) {
      setAddSubmitError(e instanceof Error ? e.message : "Error al agregar pokémon");
    } finally {
      setAddSubmitting(false);
    }
  }

  // ── Swap ───────────────────────────────────────────────────────────────────
  async function handleSwapVerify() {
    const blocks = parseShowdownPaste(swapPaste);
    if (blocks.length === 0) { setSwapError("No se encontró pokémon."); return; }
    setSwapResolving(true);
    setSwapError(null);
    try {
      const mon = blocks[0];
      let match = searchPokemon(mon.species, 1)[0];
      if (!match) match = searchPokemon(mon.species.replace(/-\w+$/, ""), 1)[0];
      if (!match) { setSwapError(`No se encontró "${mon.species}" en PokeAPI.`); return; }
      const detail = await getPokemonDetail(match.id);
      setSwapParsed({ ...mon, national_dex: detail.id, types: detail.types, sprite_url: detail.sprite, color: detail.color, generation: detail.generation, egg_groups: detail.egg_groups });
    } finally {
      setSwapResolving(false);
    }
  }

  async function handleSwapConfirm() {
    if (!swapTarget || !swapParsed) return;
    setSwapSubmitting(true);
    setSwapError(null);
    try {
      await removePokemonFromRoster(username.trim().toLowerCase(), swapTarget.pokemon_id);
      await addPokemonToRoster(username.trim().toLowerCase(), [{
        name:         swapParsed.species,
        national_dex: swapParsed.national_dex ?? null,
        types:        swapParsed.types        ?? null,
        sprite_url:   swapParsed.sprite_url   ?? null,
        held_item:    swapParsed.held_item    ?? null,
        ability:      swapParsed.ability      ?? null,
        nature:       swapParsed.nature       ?? null,
        tera_type:    swapParsed.tera_type    ?? null,
        moves:        swapParsed.moves,
        evs:          swapParsed.evs,
        ivs:          swapParsed.ivs,
        color:        swapParsed.color        ?? null,
        generation:   swapParsed.generation   ?? null,
        egg_groups:   swapParsed.egg_groups   ?? [],
      }]);
      const updated = await getRoster(username.trim().toLowerCase()).catch(() => null);
      setRoster(updated);
      setSwapTarget(null); setSwapPaste(""); setSwapParsed(null); setSwapMode(false);
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : "Error al cambiar pokémon");
    } finally {
      setSwapSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-16 px-4 pb-16">
      <div className="w-full max-w-lg flex flex-col gap-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center mb-2">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Swords className="size-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Registro de equipo</h1>
          {season && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm text-muted-foreground">
                {season.season_name} · {season.max_team_size} pokémon · {season.max_team_changes} rotaciones
              </p>
              {(season.restrictions.required_color || season.restrictions.required_generation || season.restrictions.item_clause) && (
                <div className="flex flex-wrap justify-center gap-1.5 text-[10px] text-muted-foreground">
                  {season.restrictions.required_color && (
                    <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                      Color: {season.restrictions.required_color}
                    </span>
                  )}
                  {season.restrictions.required_generation && (
                    <span className="rounded-full border border-border px-2 py-0.5">
                      Gen {season.restrictions.required_generation}
                    </span>
                  )}
                  {season.restrictions.required_egg_group && (
                    <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                      Egg: {season.restrictions.required_egg_group}
                    </span>
                  )}
                  {season.restrictions.item_clause && (
                    <span className="rounded-full border border-border px-2 py-0.5">Item Clause</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Step: username ────────────────────────────────────────────────── */}
        {step === "username" && (
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Tu username</CardTitle>
              <CardDescription className="text-xs">
                Ingresa tu nombre exacto de Pokémon Showdown.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Username de PS"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setCheckError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && void handleCheckUsername()}
                  disabled={checking}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 h-9 text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => void handleCheckUsername()}
                  disabled={!username.trim() || checking}
                  className="shrink-0 gap-1.5"
                >
                  {checking
                    ? <><RefreshCw className="size-3.5 animate-spin" />Buscando…</>
                    : <><ChevronRight className="size-3.5" />Continuar</>
                  }
                </Button>
              </div>
              {checkError && <p className="text-xs text-destructive">{checkError}</p>}
            </CardContent>
          </Card>
        )}

        {/* ── Step: import paste ────────────────────────────────────────────── */}
        {step === "import" && season && (
          <>
            <Card className="shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Importar equipo</CardTitle>
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {parsed.length > 0 ? `${parsed.length} / ${season.max_team_size}` : `0 / ${season.max_team_size}`}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Pega tu equipo en formato Pokémon Showdown.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">

                {/* Textarea */}
                {parsed.length === 0 && (
                  <>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                      rows={12}
                      placeholder={`Abomasnow @ Heavy-Duty Boots\nAbility: Snow Warning\nEVs: 248 HP / 252 SpA / 8 SpD\nIVs: 0 Atk\nTera Type: Water\nModest Nature\n- Aurora Veil\n- Blizzard\n- Giga Drain\n- Earth Power\n\nGarchomp @ Choice Scarf\n...`}
                      value={paste}
                      onChange={(e) => { setPaste(e.target.value); setParseError(null); }}
                      disabled={resolving}
                    />
                    {parseError && <p className="text-xs text-destructive">{parseError}</p>}
                    <Button
                      size="sm"
                      onClick={() => void handleParsePaste()}
                      disabled={!paste.trim() || resolving}
                      className="gap-1.5 self-end"
                    >
                      {resolving
                        ? <><RefreshCw className="size-3.5 animate-spin" />Verificando…</>
                        : <><Search className="size-3.5" />Verificar equipo</>
                      }
                    </Button>
                  </>
                )}

                {/* Preview */}
                {parsed.length > 0 && (
                  <>
                    {parseError && <p className="text-xs text-amber-400">{parseError}</p>}

                    {/* Ban warning banner */}
                    {parsed.some((p) => bannedNames.has(p.species.toLowerCase())) && (
                      <div className="flex items-start gap-2 rounded-md border border-red-800/40 bg-red-900/15 px-3 py-2 text-xs text-red-400">
                        <span className="shrink-0 mt-0.5">⚠</span>
                        <span>
                          Pokémon baneados:{" "}
                          <strong>
                            {parsed.filter((p) => bannedNames.has(p.species.toLowerCase())).map((p) => p.species).join(", ")}
                          </strong>
                          . Debes quitarlos antes de registrar.
                        </span>
                      </div>
                    )}

                    {/* Restriction violation banners */}
                    {restrictionViolations.map((v) => (
                      <div key={v.key} className="flex items-start gap-2 rounded-md border border-amber-800/40 bg-amber-900/15 px-3 py-2 text-xs text-amber-400">
                        <span className="shrink-0 mt-0.5">⚠</span>
                        <span>
                          {v.key === "item_clause"
                            ? <><strong>Item Clause</strong> — ítem repetido: <strong>{v.names.join(", ")}</strong>.</>
                            : <><strong>{v.label}</strong> — tu equipo no incluye ninguno. Agrega al menos uno.</>
                          }
                        </span>
                      </div>
                    ))}

                    <div className="grid grid-cols-1 gap-2">
                      {parsed.map((p, i) => {
                        const isBanned = bannedNames.has(p.species.toLowerCase());
                        return (
                          <div key={i} className={isBanned ? "ring-1 ring-red-700/60 rounded-lg" : ""}>
                            <PokemonCard
                              p={p}
                              onRemove={() => {
                                const next = parsed.filter((_, j) => j !== i);
                                setParsed(next);
                                if (next.length === 0) setPaste("");
                              }}
                              banned={isBanned}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={() => { setParsed([]); setPaste(""); setParseError(null); setBannedNames(new Set()); setRestrictionViolations([]); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← Editar paste
                      </button>
                      {submitError && <p className="text-xs text-destructive">{submitError}</p>}
                      <Button
                        size="sm"
                        onClick={() => void handleRegister()}
                        disabled={
                          parsed.length === 0 ||
                          submitting ||
                          parsed.some((p) => bannedNames.has(p.species.toLowerCase())) ||
                          restrictionViolations.length > 0
                        }
                        className="gap-1.5"
                      >
                        {submitting
                          ? <><RefreshCw className="size-3.5 animate-spin" />Registrando…</>
                          : <><CheckCircle2 className="size-3.5" />Registrar equipo</>
                        }
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <button
              onClick={() => { setStep("username"); setPaste(""); setParsed([]); setParseError(null); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              <ArrowLeft className="size-3" />Volver
            </button>
          </>
        )}

        {/* ── Step: view existing roster ────────────────────────────────────── */}
        {step === "view" && roster && (
          <>
            <Card className="shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">Tu equipo — {roster.season_name}</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-xs tabular-nums">
                      {roster.pool.length} / {season?.max_team_size ?? roster.max_team_size ?? 8} pkm
                    </Badge>
                    {!roster.is_locked && roster.pool.length > 0 && !swapMode && (
                      roster.pool.length < (season?.max_team_size ?? roster.max_team_size ?? 8)
                        ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                            onClick={() => { setAddPaste(""); setAddParsed([]); setAddParseError(null); setStep("add"); }}>
                            <Plus className="size-3" />Agregar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                            onClick={() => { setSwapMode(true); setSwapTarget(null); setSwapPaste(""); setSwapParsed(null); setSwapError(null); }}>
                            <Edit3 className="size-3" />Editar
                          </Button>
                        )
                    )}
                    {swapMode && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                        onClick={() => { setSwapMode(false); setSwapTarget(null); setSwapPaste(""); setSwapParsed(null); setSwapError(null); }}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
                {(roster.is_locked || roster.lineup_set || swapMode || swapTarget) && (
                  <CardDescription className="text-xs">
                    {roster.is_locked && "Equipo bloqueado"}
                    {roster.lineup_set && " · Alineación activa definida"}
                    {swapMode && !swapTarget && "Selecciona el pokémon que quieres cambiar"}
                    {swapTarget && `Reemplazando: ${swapTarget.name}`}
                  </CardDescription>
                )}
              </CardHeader>


              <Separator />

              <CardContent className="pt-4 flex flex-col gap-2">
                {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
                {roster.pool.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">No tienes pokémon registrados.</p>
                    <Button size="sm" onClick={() => setStep("import")} className="gap-1.5">
                      <Upload className="size-3.5" />
                      Importar equipo
                    </Button>
                  </div>
                ) : (
                  roster.pool.map((p) => (
                    <PokemonCard
                      key={p.pokemon_id}
                      p={p}
                      inLineup={p.in_lineup && !swapMode}
                      onDelete={!swapMode && !roster.is_locked ? () => { setDeleteError(null); setDeleteTarget(p); } : undefined}
                      onSwap={swapMode && !swapTarget ? () => { setSwapTarget(p); setSwapPaste(""); setSwapParsed(null); setSwapError(null); } : undefined}
                    />
                  ))
                )}

                {/* ── Swap paste area ── */}
                {swapTarget && (
                  <div className="mt-2 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs font-medium text-primary">
                      Pegando reemplazo para <span className="capitalize">{swapTarget.name}</span>
                    </p>
                    {!swapParsed ? (
                      <>
                        <textarea
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                          rows={8}
                          placeholder={`Nombre @ Objeto\nAbility: Habilidad\nTera Type: Tipo\nNature\n- Move 1\n...`}
                          value={swapPaste}
                          onChange={(e) => { setSwapPaste(e.target.value); setSwapError(null); }}
                          disabled={swapResolving}
                        />
                        {swapError && <p className="text-xs text-destructive">{swapError}</p>}
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => setSwapTarget(null)}>
                            ← Volver
                          </Button>
                          <Button size="sm" className="h-7 text-xs gap-1.5"
                            onClick={() => void handleSwapVerify()}
                            disabled={!swapPaste.trim() || swapResolving}>
                            {swapResolving
                              ? <><RefreshCw className="size-3 animate-spin" />Verificando…</>
                              : <><Search className="size-3" />Verificar</>
                            }
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <PokemonCard p={swapParsed} />
                        {swapError && <p className="text-xs text-destructive">{swapError}</p>}
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => { setSwapParsed(null); setSwapPaste(""); }}>
                            ← Editar
                          </Button>
                          <Button size="sm" className="h-7 text-xs gap-1.5"
                            onClick={() => void handleSwapConfirm()}
                            disabled={swapSubmitting}>
                            {swapSubmitting
                              ? <><RefreshCw className="size-3 animate-spin" />Cambiando…</>
                              : <><ArrowLeftRight className="size-3" />Confirmar cambio</>
                            }
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <button
              onClick={() => { setStep("username"); setRoster(null); setSwapMode(false); setSwapTarget(null); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              <ArrowLeft className="size-3" />Volver
            </button>
          </>
        )}

        {/* ── Step: add pokémon to existing roster ──────────────────────────── */}
        {step === "add" && season && roster && (
          <>
            <Card className="shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Agregar pokémon</CardTitle>
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {roster.pool.length} / {season.max_team_size} · {season.max_team_size - roster.pool.length} disponible{season.max_team_size - roster.pool.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Puedes agregar hasta {season.max_team_size - roster.pool.length} pokémon más al equipo.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {addParsed.length === 0 ? (
                  <>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                      rows={10}
                      placeholder={`Nombre @ Objeto\nAbility: Habilidad\nTera Type: Tipo\nNature\n- Move 1\n\nNombre2 @ Objeto2\n...`}
                      value={addPaste}
                      onChange={(e) => { setAddPaste(e.target.value); setAddParseError(null); }}
                      disabled={addResolving}
                    />
                    {addParseError && <p className="text-xs text-destructive">{addParseError}</p>}
                    <Button size="sm" onClick={() => void handleAddVerify()}
                      disabled={!addPaste.trim() || addResolving} className="gap-1.5 self-end">
                      {addResolving
                        ? <><RefreshCw className="size-3.5 animate-spin" />Verificando…</>
                        : <><Search className="size-3.5" />Verificar</>
                      }
                    </Button>
                  </>
                ) : (
                  <>
                    {addParseError && <p className="text-xs text-amber-400">{addParseError}</p>}
                    {addParsed.some((p) => addBanned.has(p.species.toLowerCase())) && (
                      <div className="flex items-start gap-2 rounded-md border border-red-800/40 bg-red-900/15 px-3 py-2 text-xs text-red-400">
                        <span className="shrink-0 mt-0.5">⚠</span>
                        <span>Pokémon baneados: <strong>{addParsed.filter((p) => addBanned.has(p.species.toLowerCase())).map((p) => p.species).join(", ")}</strong>. Debes quitarlos.</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2">
                      {addParsed.map((p, i) => (
                        <div key={i} className={addBanned.has(p.species.toLowerCase()) ? "ring-1 ring-red-700/60 rounded-lg" : ""}>
                          <PokemonCard
                            p={p}
                            banned={addBanned.has(p.species.toLowerCase())}
                            onRemove={() => {
                              const next = addParsed.filter((_, j) => j !== i);
                              setAddParsed(next);
                              if (next.length === 0) setAddPaste("");
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={() => { setAddParsed([]); setAddPaste(""); setAddParseError(null); setAddBanned(new Set()); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← Editar paste
                      </button>
                      {addSubmitError && <p className="text-xs text-destructive">{addSubmitError}</p>}
                      <Button size="sm" onClick={() => void handleAddSubmit()}
                        disabled={addParsed.length === 0 || addSubmitting || addParsed.some((p) => addBanned.has(p.species.toLowerCase()))}
                        className="gap-1.5">
                        {addSubmitting
                          ? <><RefreshCw className="size-3.5 animate-spin" />Agregando…</>
                          : <><Plus className="size-3.5" />Agregar al equipo</>
                        }
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <button
              onClick={() => { setAddPaste(""); setAddParsed([]); setAddParseError(null); setStep("view"); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              <ArrowLeft className="size-3" />Volver al equipo
            </button>
          </>
        )}

        {/* ── Step: success ─────────────────────────────────────────────────── */}
        {step === "success" && roster && (
          <Card className="shadow-none">
            <CardHeader className="pb-3 text-center">
              <div className="flex justify-center mb-2">
                <CheckCircle2 className="size-8 text-emerald-500" />
              </div>
              <CardTitle className="text-sm font-semibold">¡Equipo registrado!</CardTitle>
              <CardDescription className="text-xs">
                {username} está registrado en {roster.season_name}.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 flex flex-col gap-2">
              {roster.pool.map((p) => (
                <PokemonCard key={p.pokemon_id} p={p} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Delete confirmation dialog ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Eliminar pokémon</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              ¿Seguro que quieres eliminar a{" "}
              <strong className="capitalize">{deleteTarget?.name}</strong> de tu equipo registrado?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-xs text-destructive px-1">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteConfirm()}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><RefreshCw className="size-3 animate-spin mr-1" />Eliminando…</> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
