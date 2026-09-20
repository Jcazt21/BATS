import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Info, Calendar, Hash, ToggleLeft, Swords, RefreshCw, CheckCircle2 } from "lucide-react";
import {
  getSeasons, createSeason, activateSeason, closeSeason, deleteSeason, updateSeason, runEtl,
  getSeasonVotes, getSeasonWhitelist, addSeasonWhitelist, removeSeasonWhitelist,
  getLeagueSettings,
  DEFAULT_RESTRICTION_SPEC,
  type SeasonEntry, type VoteEntry, type WhitelistPlayer,
  type SeasonRestrictions, type RestrictionSpec,
} from "@/lib/api";
import { RestrictionField } from "@/components/RestrictionField";

const TYPE_COLORS: Record<string, string> = {
  Water:    "bg-blue-900/60   text-blue-300",
  Fire:     "bg-orange-900/60 text-orange-300",
  Grass:    "bg-green-900/60  text-green-300",
  Electric: "bg-yellow-800/60 text-yellow-300",
  Ice:      "bg-cyan-900/60   text-cyan-300",
  Psychic:  "bg-pink-900/60   text-pink-300",
  Dragon:   "bg-indigo-800/60 text-indigo-200",
  Dark:     "bg-zinc-800/60   text-zinc-300",
  Normal:   "bg-zinc-700/60   text-zinc-200",
  Ghost:    "bg-violet-900/60 text-violet-300",
  Fighting: "bg-red-900/60    text-red-300",
  Steel:    "bg-slate-700/60  text-slate-300",
  Fairy:    "bg-rose-900/60   text-rose-300",
  Poison:   "bg-purple-900/60 text-purple-300",
  Ground:   "bg-amber-900/60  text-amber-300",
  Flying:   "bg-indigo-900/60 text-indigo-300",
  Bug:      "bg-lime-900/60   text-lime-300",
  Rock:     "bg-stone-700/60  text-stone-300",
};

const TYPE_OPTIONS = [
  "Water","Fire","Grass","Electric","Ice","Psychic","Dragon","Dark",
  "Normal","Ghost","Fighting","Steel","Fairy","Poison","Ground","Flying","Bug","Rock",
];

function TypeBadges({ types }: { types: string | null }) {
  if (!types) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {types.split(" / ").map((t) => (
        <Badge key={t} variant="secondary" className={`text-xs px-1.5 py-0 ${TYPE_COLORS[t] ?? ""}`}>
          {t}
        </Badge>
      ))}
    </div>
  );
}

// =============================================================================
// Season Bans Sheet
// =============================================================================

function SeasonBansSheet({
  season,
  token,
  open,
  onClose,
}: {
  season: SeasonEntry;
  token: string;
  open: boolean;
  onClose: () => void;
}) {
  const [votes,     setVotes]     = useState<VoteEntry[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistPlayer[]>([]);
  const [loading,   setLoading]   = useState(false);

  // Add whitelist form
  const [wlUser,   setWlUser]   = useState("");
  const [wlAdding, setWlAdding] = useState(false);
  const [wlError,  setWlError]  = useState<string | null>(null);

  // Remove whitelist confirm
  const [removeTarget, setRemoveTarget] = useState<WhitelistPlayer | null>(null);
  const [actioning,    setActioning]    = useState(false);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [v, w] = await Promise.all([
        getSeasonVotes(token, season.season_id),
        getSeasonWhitelist(token, season.season_id),
      ]);
      setVotes(v);
      setWhitelist(w);
    } finally {
      setLoading(false);
    }
  }, [open, token, season.season_id]);

  useEffect(() => { void load(); }, [load]);

  async function handleAddWhitelist() {
    if (!wlUser.trim()) return;
    setWlAdding(true);
    setWlError(null);
    try {
      await addSeasonWhitelist(token, season.season_id, wlUser.trim());
      setWlUser("");
      await load();
    } catch (e) {
      setWlError(e instanceof Error ? e.message : "Error al agregar jugador");
    } finally {
      setWlAdding(false);
    }
  }

  async function handleRemoveWhitelist() {
    if (!removeTarget) return;
    setActioning(true);
    try {
      await removeSeasonWhitelist(token, season.season_id, removeTarget.voter_hash);
      setRemoveTarget(null);
      await load();
    } finally {
      setActioning(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
            <SheetTitle className="text-base font-semibold">{season.season_name}</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Whitelist de votantes y ranking de votos
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Cargando…
            </div>
          ) : (
            <Tabs defaultValue="whitelist" className="flex flex-col flex-1">
              <TabsList className="mx-6 mt-4 mb-0 w-auto self-start">
                <TabsTrigger value="whitelist">
                  Whitelist
                  {whitelist.length > 0 && (
                    <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded-full px-1.5">
                      {whitelist.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="votes">
                  Votos
                  {votes.length > 0 && (
                    <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded-full px-1.5">
                      {votes.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ── Tab: Whitelist ── */}
              <TabsContent value="whitelist" className="flex flex-col gap-4 px-6 pt-4 pb-6 flex-1">
                <div className="flex flex-col gap-3 p-4 rounded-lg border border-border/60 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Agregar jugador
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-1"
                      placeholder="Username de PS"
                      value={wlUser}
                      onChange={(e) => setWlUser(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleAddWhitelist()}
                    />
                    <Button size="sm" className="h-8 px-3" onClick={() => void handleAddWhitelist()}
                      disabled={wlAdding || !wlUser.trim()}>
                      {wlAdding ? "…" : "Agregar"}
                    </Button>
                  </div>
                  {wlError && <p className="text-xs text-destructive">{wlError}</p>}
                </div>

                {whitelist.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Sin jugadores en el whitelist de esta temporada.
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-border rounded-lg border border-border/60 overflow-hidden">
                    {whitelist.map((p) => (
                      <div key={p.voter_hash} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-sm font-medium">{p.username}</span>
                          {p.voted && (
                            <span className="text-xs text-emerald-400">Ya votó</span>
                          )}
                        </div>
                        {!p.voted && (
                          <Button size="sm" variant="outline"
                            className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10 h-7"
                            onClick={() => setRemoveTarget(p)}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── Tab: Votos ── */}
              <TabsContent value="votes" className="flex flex-col gap-2 px-6 pt-4 pb-6">
                {votes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Sin votos registrados en esta temporada.
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-border rounded-lg border border-border/60 overflow-hidden">
                    {votes.map((v) => (
                      <div key={v.pokemon_name} className="flex items-center gap-3 px-4 py-3">
                        {v.sprite_url ? (
                          <img src={v.sprite_url} alt={v.pokemon_name} className="w-10 h-10 object-contain flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex-shrink-0" />
                        )}
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{v.pokemon_name}</span>
                            <TypeBadges types={v.pokemon_types} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-sm font-semibold">{v.total_votes}</span>
                          <span className="text-xs text-muted-foreground">voto{v.total_votes !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* Remove whitelist confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar del whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{removeTarget?.username}</strong> del whitelist de esta temporada.
              No podrá votar a menos que lo vuelvas a agregar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemoveWhitelist()} disabled={actioning}
              className="bg-destructive hover:bg-destructive/90">
              {actioning ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export function SeasonsPage() {
  const navigate = useNavigate();
  const token    = sessionStorage.getItem("bats_admin_token") ?? "";

  const [seasons, setSeasons] = useState<SeasonEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Restriction spec (loaded once, fallback to static default)
  const [restrictionSpec, setRestrictionSpec] = useState<Record<string, RestrictionSpec>>(DEFAULT_RESTRICTION_SPEC);

  // Create sheet
  const [showCreate,       setShowCreate]       = useState(false);
  const [newName,          setNewName]          = useState("");
  const [newType,          setNewType]          = useState("Water");
  const [newStart,         setNewStart]         = useState(new Date().toISOString().slice(0, 10));
  const [newMaxTeamSize,   setNewMaxTeamSize]   = useState(8);
  const [newMaxTeamChanges,setNewMaxTeamChanges]= useState(4);
  const [newRestrictions,  setNewRestrictions]  = useState<SeasonRestrictions>({});
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Season action confirms
  const [activateTarget, setActivateTarget] = useState<SeasonEntry | null>(null);
  const [closeTarget,    setCloseTarget]    = useState<SeasonEntry | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<SeasonEntry | null>(null);
  const [actioning,      setActioning]      = useState(false);

  // Bans sheet
  const [bansTarget, setBansTarget] = useState<SeasonEntry | null>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; season: SeasonEntry } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // Edit dialog
  const [editTarget,         setEditTarget]         = useState<SeasonEntry | null>(null);
  const [editName,           setEditName]           = useState("");
  const [editType,           setEditType]           = useState("Water");
  const [editStart,          setEditStart]          = useState("");
  const [editEnd,            setEditEnd]            = useState("");
  const [editActive,         setEditActive]         = useState(false);
  const [editMaxTeamSize,    setEditMaxTeamSize]    = useState(8);
  const [editMaxTeamChanges, setEditMaxTeamChanges] = useState(4);
  const [editRestrictions,   setEditRestrictions]   = useState<SeasonRestrictions>({});
  const [editing,            setEditing]            = useState(false);
  const [editError,          setEditError]          = useState<string | null>(null);

  // Details dialog
  const [detailsTarget, setDetailsTarget] = useState<SeasonEntry | null>(null);

  // Recalculate seasons
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult,  setRecalcResult]  = useState<string | null>(null);

  const handleUnauth = useCallback(() => {
    sessionStorage.removeItem("bats_admin_token");
    navigate("/admin");
  }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSeasons(await getSeasons(token));
    } catch {
      handleUnauth();
    } finally {
      setLoading(false);
    }
  }, [token, handleUnauth]);

  useEffect(() => { void load(); }, [load]);

  // Load restriction spec once (use active-season spec if available, else DEFAULT)
  useEffect(() => {
    getLeagueSettings(token)
      .then((s) => {
        if (s.restriction_spec && Object.keys(s.restriction_spec).length > 0) {
          setRestrictionSpec(s.restriction_spec);
        }
      })
      .catch(() => { /* no active season — keep DEFAULT_RESTRICTION_SPEC */ });
  }, [token]);

  // Close context menu on outside click / scroll / Escape
  useEffect(() => {
    if (!ctxMenu) return;
    function close() { setCtxMenu(null); }
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [ctxMenu]);

  async function handleRecalculate() {
    setRecalculating(true);
    setRecalcResult(null);
    setError(null);
    try {
      const r = await runEtl(token);
      setRecalcResult(
        `${r.seasons.updated} batallas reasignadas` +
        (r.etl.loaded > 0 ? ` · ${r.etl.loaded} nuevas batallas cargadas` : "") +
        (r.seasons.error ? ` · ⚠ ${r.seasons.error}` : ""),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al recalcular");
    } finally {
      setRecalculating(false);
    }
  }

  function openContextMenu(e: React.MouseEvent, season: SeasonEntry) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, season });
  }

  function openEdit(season: SeasonEntry) {
    setCtxMenu(null);
    setEditTarget(season);
    setEditName(season.season_name);
    setEditType(season.type_of_month);
    setEditStart(season.start_date ?? "");
    setEditEnd(season.end_date ?? "");
    setEditActive(season.is_active);
    setEditMaxTeamSize(season.max_team_size ?? 8);
    setEditMaxTeamChanges(season.max_team_changes ?? 4);
    setEditRestrictions(season.restrictions ?? {});
    setEditError(null);
  }

  function openDetails(season: SeasonEntry) {
    setCtxMenu(null);
    setDetailsTarget(season);
  }

  async function handleEdit() {
    if (!editTarget) return;
    setEditing(true);
    setEditError(null);
    try {
      const payload: Parameters<typeof updateSeason>[2] = {};
      if (editName   !== editTarget.season_name)        payload.season_name   = editName;
      if (editType   !== editTarget.type_of_month)      payload.type_of_month = editType;
      if (editStart  !== (editTarget.start_date ?? "")) payload.start_date    = editStart || undefined;
      if (editActive !== editTarget.is_active)          payload.is_active     = editActive;

      const prevEnd = editTarget.end_date ?? "";
      if (editEnd !== prevEnd) {
        if (!editEnd) payload.clear_end_date = true;
        else          payload.end_date = editEnd;
      }

      if (editMaxTeamSize    !== (editTarget.max_team_size    ?? 8)) payload.max_team_size    = editMaxTeamSize;
      if (editMaxTeamChanges !== (editTarget.max_team_changes ?? 4)) payload.max_team_changes = editMaxTeamChanges;
      // Always send restrictions to allow clearing them
      payload.restrictions = editRestrictions;

      await updateSeason(token, editTarget.season_id, payload);
      setEditTarget(null);
      await load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setEditing(false);
    }
  }

  function resetCreateForm() {
    setNewName(""); setNewType("Water"); setNewStart(new Date().toISOString().slice(0, 10));
    setNewMaxTeamSize(8); setNewMaxTeamChanges(4); setNewRestrictions({});
    setCreateError(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createSeason(token, {
        season_name:      newName.trim(),
        type_of_month:    newType,
        start_date:       newStart,
        max_team_size:    newMaxTeamSize,
        max_team_changes: newMaxTeamChanges,
        restrictions:     newRestrictions,
      });
      setShowCreate(false);
      resetCreateForm();
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al crear temporada");
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate() {
    if (!activateTarget) return;
    setActioning(true);
    try {
      await activateSeason(token, activateTarget.season_id);
      setActivateTarget(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally     { setActioning(false); }
  }

  async function handleClose() {
    if (!closeTarget) return;
    setActioning(true);
    try {
      await closeSeason(token, closeTarget.season_id);
      setCloseTarget(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally     { setActioning(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setActioning(true);
    try {
      await deleteSeason(token, deleteTarget.season_id);
      setDeleteTarget(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally     { setActioning(false); }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl w-full mx-auto">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Temporadas</h2>
          <p className="text-sm text-muted-foreground">
            Gestiona temporadas y bans oficiales. Solo puede haber una activa a la vez.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => void handleRecalculate()}
            disabled={recalculating}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Recalculando…" : "Recalcular seasons"}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>+ Nueva temporada</Button>
        </div>
      </div>

      {recalcResult && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="size-4 shrink-0" />{recalcResult}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Todas las temporadas</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {seasons.length === 0 ? "Sin temporadas aún." : `${seasons.length} temporada${seasons.length > 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>
          ) : seasons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin temporadas.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {seasons.map((s) => (
                <div key={s.season_id} className="flex items-center gap-4 px-4 py-3 select-none"
                  onContextMenu={(e) => openContextMenu(e, s)}>
                  <div className="flex-1 flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{s.season_name}</span>
                      <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${TYPE_COLORS[s.type_of_month] ?? ""}`}>
                        {s.type_of_month}
                      </Badge>
                      {s.is_active && (
                        <Badge className="text-xs px-1.5 py-0 bg-emerald-900/60 text-emerald-300 border-0">Activa</Badge>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>Inicio: {s.start_date ?? "—"}</span>
                      {s.end_date && <span>Fin: {s.end_date}</span>}
                      <span>{s.total_votes} votos</span>
                      <span>{s.total_bans} bans</span>
                      <span>{s.max_team_size ?? 8} pkm · {s.max_team_changes ?? 4} cambios</span>
                      {s.restrictions?.item_clause && <span className="text-violet-400">Item Clause</span>}
                      {s.restrictions?.required_color && <span className="text-sky-400">Color: {s.restrictions.required_color as string}</span>}
                      {s.restrictions?.required_generation && <span className="text-amber-400">Gen {s.restrictions.required_generation as number}</span>}
                      {s.restrictions?.required_egg_group && <span className="text-emerald-400">Egg: {s.restrictions.required_egg_group as string}</span>}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setBansTarget(s)}>
                      Bans
                    </Button>
                    {!s.is_active && !s.end_date && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setActivateTarget(s)}>
                        Activar
                      </Button>
                    )}
                    {s.is_active && (
                      <Button
                        size="sm" variant="outline"
                        className="text-xs text-amber-500 border-amber-500/40 hover:bg-amber-950/30"
                        onClick={() => setCloseTarget(s)}
                      >
                        Cerrar
                      </Button>
                    )}
                    {!s.is_active && s.total_votes === 0 && s.total_bans === 0 && (
                      <Button
                        size="sm" variant="outline"
                        className="text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(s)}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bans sheet */}
      {bansTarget && (
        <SeasonBansSheet
          season={bansTarget}
          token={token}
          open={!!bansTarget}
          onClose={() => { setBansTarget(null); void load(); }}
        />
      )}

      {/* Create sheet — all settings in one flow */}
      <Sheet open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); resetCreateForm(); } else setShowCreate(true); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
            <SheetTitle className="text-base font-semibold">Nueva temporada</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Configura la temporada completa antes de crearla.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 px-6 py-6 flex-1 overflow-y-auto">
            {/* ── Información básica ── */}
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Información básica</p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="s-name" className="text-xs font-medium">Nombre</label>
                <Input id="s-name" placeholder="ej: Temporada 2 — Fuego" value={newName}
                  onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="s-type" className="text-xs font-medium">Tipo del mes</label>
                <select id="s-type" value={newType} onChange={(e) => setNewType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="s-start" className="text-xs font-medium">Fecha de inicio</label>
                <Input id="s-start" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
              </div>
            </div>

            <Separator />

            {/* ── Reglas del equipo ── */}
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reglas del equipo</p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="s-team-size" className="text-xs font-medium">Pokémon por equipo</label>
                <Input id="s-team-size" type="number" min={1} max={20} value={newMaxTeamSize}
                  onChange={(e) => setNewMaxTeamSize(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="h-9 text-sm" />
                <p className="text-xs text-muted-foreground">Máximo de pokémon que cada jugador puede registrar.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="s-changes" className="text-xs font-medium">Rotaciones permitidas</label>
                <Input id="s-changes" type="number" min={0} max={20} value={newMaxTeamChanges}
                  onChange={(e) => setNewMaxTeamChanges(Math.max(0, Math.min(20, Number(e.target.value))))}
                  className="h-9 text-sm" />
                <p className="text-xs text-muted-foreground">Número de cambios de alineación activa permitidos.</p>
              </div>
            </div>

            <Separator />

            {/* ── Restricciones ── */}
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restricciones de registro</p>
              {Object.entries(restrictionSpec).map(([key, spec]) => (
                <RestrictionField
                  key={key}
                  rkey={key}
                  spec={spec}
                  value={newRestrictions[key as keyof SeasonRestrictions]}
                  onChange={(k, v) => setNewRestrictions((prev) => ({ ...prev, [k]: v }))}
                />
              ))}
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>

          <div className="px-6 py-4 border-t border-border/50 flex justify-end gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); resetCreateForm(); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
              {creating ? "Creando…" : "Crear temporada"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Activate confirm */}
      <AlertDialog open={!!activateTarget} onOpenChange={(o) => !o && setActivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar temporada?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivarán todas las demás temporadas. Solo <strong>{activateTarget?.season_name}</strong> quedará activa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleActivate()} disabled={actioning}>
              {actioning ? "Activando…" : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close confirm */}
      <AlertDialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar temporada?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará hoy como fecha de cierre de <strong>{closeTarget?.season_name}</strong>.
              No se podrán recibir más votos. Esta acción no se puede deshacer fácilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleClose()} disabled={actioning}
              className="bg-amber-600 hover:bg-amber-700">
              {actioning ? "Cerrando…" : "Cerrar temporada"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar temporada?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente <strong>{deleteTarget?.season_name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={actioning}
              className="bg-destructive hover:bg-destructive/90">
              {actioning ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Separator className="opacity-0" />

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="min-w-[160px] rounded-md border border-border bg-popover shadow-lg py-1 text-sm"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors text-left"
            onClick={() => openEdit(ctxMenu.season)}
          >
            <Pencil className="size-3.5" />Editar temporada
          </button>
          <button
            className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors text-left"
            onClick={() => openDetails(ctxMenu.season)}
          >
            <Info className="size-3.5" />Ver detalles
          </button>
        </div>
      )}

      {/* ── Edit sheet ───────────────────────────────────────────────────── */}
      <Sheet open={!!editTarget} onOpenChange={(o) => { if (!o && !editing) setEditTarget(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
            <SheetTitle className="text-base font-semibold">Editar temporada</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {editTarget?.season_name}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 px-6 py-6 flex-1 overflow-y-auto">
            {/* ── Información básica ── */}
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Información básica</p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Nombre</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre de la temporada" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Tipo del mes</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Fecha de inicio</label>
                  <Input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Fecha de fin <span className="text-muted-foreground font-normal">(opcional)</span></label>
                  <Input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="cursor-pointer accent-primary size-4"
                />
                <span className="text-sm">Temporada activa</span>
                {editActive && !editTarget?.is_active && (
                  <span className="text-xs text-amber-500">(desactivará las demás)</span>
                )}
              </label>
            </div>

            <Separator />

            {/* ── Reglas del equipo ── */}
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reglas del equipo</p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Pokémon por equipo</label>
                <Input type="number" min={1} max={20} value={editMaxTeamSize}
                  onChange={(e) => setEditMaxTeamSize(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="h-9 text-sm" />
                <p className="text-xs text-muted-foreground">Máximo de pokémon que cada jugador puede registrar.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Rotaciones permitidas</label>
                <Input type="number" min={0} max={20} value={editMaxTeamChanges}
                  onChange={(e) => setEditMaxTeamChanges(Math.max(0, Math.min(20, Number(e.target.value))))}
                  className="h-9 text-sm" />
                <p className="text-xs text-muted-foreground">Número de cambios de alineación activa permitidos.</p>
              </div>
            </div>

            <Separator />

            {/* ── Restricciones ── */}
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restricciones de registro</p>
              {Object.entries(restrictionSpec).map(([key, spec]) => (
                <RestrictionField
                  key={key}
                  rkey={key}
                  spec={spec}
                  value={editRestrictions[key as keyof SeasonRestrictions]}
                  onChange={(k, v) => setEditRestrictions((prev) => ({ ...prev, [k]: v }))}
                />
              ))}
            </div>

            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>

          <div className="px-6 py-4 border-t border-border/50 flex justify-end gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)} disabled={editing}>Cancelar</Button>
            <Button size="sm" onClick={() => void handleEdit()} disabled={editing || !editName.trim()}>
              {editing ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Details dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!detailsTarget} onOpenChange={(o) => { if (!o) setDetailsTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="size-4" />Detalles de temporada
            </DialogTitle>
          </DialogHeader>
          {detailsTarget && (
            <div className="flex flex-col gap-3 py-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`text-xs px-2 py-0.5 ${TYPE_COLORS[detailsTarget.type_of_month] ?? ""}`}>
                  {detailsTarget.type_of_month}
                </Badge>
                {detailsTarget.is_active && (
                  <Badge className="text-xs px-2 py-0.5 bg-emerald-900/60 text-emerald-300 border-0">Activa</Badge>
                )}
                <span className="font-semibold">{detailsTarget.season_name}</span>
              </div>
              <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                {[
                  { icon: <Hash className="size-3.5" />,        label: "ID",          value: `#${detailsTarget.season_id}` },
                  { icon: <Calendar className="size-3.5" />,    label: "Inicio",      value: detailsTarget.start_date ?? "—" },
                  { icon: <Calendar className="size-3.5" />,    label: "Fin",         value: detailsTarget.end_date ?? "Sin fecha de cierre" },
                  { icon: <ToggleLeft className="size-3.5" />,  label: "Estado",      value: detailsTarget.is_active ? "Activa" : "Inactiva" },
                  { icon: <Swords className="size-3.5" />,      label: "Bans",        value: String(detailsTarget.total_bans) },
                  { icon: <Info className="size-3.5" />,        label: "Votos",       value: String(detailsTarget.total_votes) },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-muted-foreground shrink-0">{icon}</span>
                    <span className="text-muted-foreground w-20 shrink-0">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDetailsTarget(null)}>Cerrar</Button>
            {detailsTarget && (
              <Button size="sm" onClick={() => { setDetailsTarget(null); openEdit(detailsTarget); }}>
                <Pencil className="size-3.5 mr-1.5" />Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
